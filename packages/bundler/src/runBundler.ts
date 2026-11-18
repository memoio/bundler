import fs from 'fs'

import { Command } from 'commander'
import {
  deployEntryPoint,
  erc4337RuntimeVersion,
  IEntryPoint,
  IEntryPoint__factory,
  RpcError,
  supportsRpcMethod
} from '@account-abstraction/utils'
import { ethers, Wallet, Signer } from 'ethers'

import { BundlerServer } from './BundlerServer'
import { UserOpMethodHandler } from './UserOpMethodHandler'
import { PaymasterSigner } from './modules/PaymasterSigner'
import { VerifyingPaymaster__factory } from './types/factories/@account-abstraction/contracts/samples/VerifyingPaymaster__factory'

import { initServer } from './modules/initServer'
import { DebugMethodHandler } from './DebugMethodHandler'
import { supportsDebugTraceCall } from '@account-abstraction/validation-manager'
import { resolveConfiguration } from './Config'
import { bundlerConfigDefault } from './BundlerConfig'
import { parseEther } from 'ethers/lib/utils'

// this is done so that console.log outputs BigNumber as hex string instead of unreadable object
export const inspectCustomSymbol = Symbol.for('nodejs.util.inspect.custom')
// @ts-ignore
ethers.BigNumber.prototype[inspectCustomSymbol] = function () {
  return `BigNumber ${parseInt(this._hex)}`
}

const CONFIG_FILE_NAME = 'workdir/bundler.config.json'

export let showStackTraces = false

export async function connectContracts (
  wallet: Signer,
  entryPointAddress: string): Promise<{ entryPoint: IEntryPoint }> {
  const entryPoint = await deployEntryPoint(wallet.provider as any, wallet as any)
  return {
    entryPoint
  }
}

/**
 * start the bundler server.
 * this is an async method, but only to resolve configuration. after it returns, the server is only active after asyncInit()
 * @param argv
 * @param overrideExit
 */
export async function runBundler (argv: string[], overrideExit = true): Promise<BundlerServer> {
  const program = new Command()

  if (overrideExit) {
    (program as any)._exit = (exitCode: any, code: any, message: any) => {
      class CommandError extends Error {
        constructor (message: string, readonly code: any, readonly exitCode: any) {
          super(message)
        }
      }

      throw new CommandError(message, code, exitCode)
    }
  }

  program
    .version(erc4337RuntimeVersion)
    .option('--beneficiary <string>', 'address to receive funds')
    .option('--gasFactor <number>')
    .option('--minBalance <number>', 'below this signer balance, keep fee for itself, ignoring "beneficiary" address ')
    .option('--network <string>', 'network name or url')
    .option('--mnemonic <file>', 'mnemonic file of signer account')
    .option('--privateKey <file>', 'private key file of signer account (takes precedence over mnemonic)')
    .option('--entryPoint <string>', 'address of the supported EntryPoint contract')
    .option('--port <number>', `server listening port (default: ${bundlerConfigDefault.port})`)
    .option('--config <string>', 'path to config file', CONFIG_FILE_NAME)
    .option('--auto', 'automatic bundling (bypass config.autoBundleMempoolSize)', false)
    .option('--unsafe', 'UNSAFE mode: no storage or opcode checks (safe mode requires geth)')
    .option('--debugRpc', 'enable debug rpc methods (auto-enabled for test node')
    .option('--conditionalRpc', 'Use eth_sendRawTransactionConditional RPC)')
    .option('--show-stack-traces', 'Show stack traces.')
    .option('--createMnemonic <file>', 'create the mnemonic file')
    .option('--paymasterEnabled', 'Enable Paymaster mode (pm_signPaymasterData API)')
    .option('--paymasterAddress <string>', 'VerifyingPaymaster contract address')
    .option('--paymasterOwnerSK <string>', 'Paymaster verifyingSigner private key (hex or file path)')
    .option('--minPaymasterDeposit <string>', 'Minimum paymaster deposit in wei (default: 1e18)', '1000000000000000000')

  const programOpts = program.parse(argv).opts()
  showStackTraces = programOpts.showStackTraces

  console.log('command-line arguments: ', program.opts())

  if (programOpts.createMnemonic != null) {
    const mnemonicFile: string = programOpts.createMnemonic
    console.log('Creating mnemonic in file', mnemonicFile)
    if (fs.existsSync(mnemonicFile)) {
      throw new Error(`Can't --createMnemonic: out file ${mnemonicFile} already exists`)
    }
    const newMnemonic = Wallet.createRandom().mnemonic.phrase
    fs.writeFileSync(mnemonicFile, newMnemonic)
    console.log('created mnemonic file', mnemonicFile)
    process.exit(1)
  }
  const { config, provider, wallet, paymasterWallet } = await resolveConfiguration(programOpts)
  const { chainId } = await provider.getNetwork()
  let mainnetDidProxy: string | undefined

  let paymasterSigner: PaymasterSigner | null = null
  if (config.paymasterEnabled) {
    if (chainId === 204) {
      const target = process.env.BUNDLER_204_DID_PROXY ?? ''
      if (!ethers.utils.isAddress(target) || await provider.getCode(target) === '0x' || config.debugRpc === true) {
        throw new Error('204 sponsorship requires a deployed BUNDLER_204_DID_PROXY and disabled debug RPC')
      }
      mainnetDidProxy = ethers.utils.getAddress(target)
    }
    if (config.paymasterAddress == null || paymasterWallet == null) {
      console.error('FATAL: --paymasterEnabled requires --paymasterAddress and --paymasterOwnerSK')
      process.exit(1)
    }
    const pmContract = VerifyingPaymaster__factory.connect(config.paymasterAddress, provider)
    const verifyingSigner = await pmContract.verifyingSigner()
    if (verifyingSigner.toLowerCase() !== paymasterWallet.address.toLowerCase()) {
      console.error('FATAL: paymasterOwnerSK address', paymasterWallet.address, 'does not match VerifyingPaymaster.verifyingSigner', verifyingSigner)
      process.exit(1)
    }
    const entryPointForDeposit = IEntryPoint__factory.connect(config.entryPoint, provider)
    const deposit = await entryPointForDeposit.balanceOf(config.paymasterAddress)
    const minDeposit = config.minPaymasterDeposit != null ? config.minPaymasterDeposit : '1000000000000000000'
    if (deposit.lt(minDeposit)) {
      console.error('FATAL: Paymaster deposit', deposit.toString(), 'is below minimum', minDeposit)
      process.exit(1)
    }
    console.log('Paymaster enabled:', config.paymasterAddress, 'verifyingSigner:', paymasterWallet.address, 'deposit:', deposit.toString())
    paymasterSigner = new PaymasterSigner(config.paymasterAddress, paymasterWallet, provider)
  }

  if (chainId === 31337 || chainId === 1337) {
    if (config.debugRpc == null) {
      console.log('== debugrpc was', config.debugRpc)
      config.debugRpc = true
    } else {
      console.log('== debugrpc already st', config.debugRpc)
    }
    const ep = await deployEntryPoint(provider as any)
    const addr = ep.address
    console.log('deployed EntryPoint at', addr)
    if ((await wallet.getBalance()).eq(0)) {
      console.log('=== testnet: fund signer')
      const signer = provider.getSigner()
      await signer.sendTransaction({ to: await wallet.getAddress(), value: parseEther('1') })
    }
  }

  if (config.conditionalRpc && !await supportsRpcMethod(provider as any, 'eth_sendRawTransactionConditional', [{}, {}])) {
    console.error('FATAL: --conditionalRpc requires a node that support eth_sendRawTransactionConditional')
    process.exit(1)
  }
  if (!config.unsafe && !await supportsDebugTraceCall(provider as any)) {
    console.error('FATAL: full validation requires a node with debug_traceCall. for local UNSAFE mode: use --unsafe')
    process.exit(1)
  }

  const {
    entryPoint
  } = await connectContracts(wallet, config.entryPoint)

  // bundleSize=1 replicate current immediate bundling mode
  const execManagerConfig = {
    ...config
    // autoBundleMempoolSize: 0
  }
  if (programOpts.auto === true) {
    execManagerConfig.autoBundleMempoolSize = 0
    execManagerConfig.autoBundleInterval = 0
  }

  const [execManager, eventsManager, reputationManager, mempoolManager] = initServer(execManagerConfig, entryPoint.signer)
  const methodHandler = new UserOpMethodHandler(
    execManager,
    provider,
    wallet,
    config,
    entryPoint
  )
  eventsManager.initEventListener()
  const debugHandler = config.debugRpc ?? false
    ? new DebugMethodHandler(execManager, eventsManager, reputationManager, mempoolManager)
    : new Proxy({}, {
      get (target: {}, method: string, receiver: any): any {
        throw new RpcError(`method debug_bundler_${method} is not supported`, -32601)
      }
    }) as DebugMethodHandler

  const bundlerServer = new BundlerServer(
    methodHandler,
    debugHandler,
    config,
    provider,
    wallet,
    paymasterSigner,
    mainnetDidProxy
  )

  void bundlerServer.asyncStart().then(() => {
    console.log(`Bundler running on http://localhost:${config.port}/rpc`)
  })

  return bundlerServer
}
