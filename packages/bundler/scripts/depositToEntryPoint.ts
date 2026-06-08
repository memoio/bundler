/**
 * 给 EntryPoint 中指定地址充值 deposit。
 *
 * 用法:
 *   yarn --cwd packages/bundler entrypoint:deposit --account 0x1234... --amount 0.1
 *   yarn --cwd packages/bundler entrypoint:deposit --network memo --account 0x1234... --amount 1
 *   BUNDLER_PRIVATE_KEY=0x... yarn --cwd packages/bundler entrypoint:deposit --network https://rpc.example --account 0x1234... --amount 0.5
 */

import fs from 'fs'
import { Command } from 'commander'
import { Signer, Wallet, ethers } from 'ethers'
import { getAddress, parseEther } from 'ethers/lib/utils'
import { IEntryPoint__factory } from '../src/types/factories/@account-abstraction/contracts/interfaces/IEntryPoint__factory'
import { getNetworkProvider } from '../src/Config'

const DEFAULT_ENTRY_POINT = process.env.ENTRY_POINT ?? '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

async function loadSignerFromOpts (opts: { privateKey?: string, mnemonic?: string }, provider: ethers.providers.JsonRpcProvider): Promise<Signer> {
  const rawPrivateKey = opts.privateKey ?? process.env.BUNDLER_PRIVATE_KEY
  if (rawPrivateKey != null && rawPrivateKey !== '') {
    if (rawPrivateKey.startsWith('0x') && rawPrivateKey.length === 66) {
      return new Wallet(rawPrivateKey, provider)
    }
    if (/^[0-9a-fA-F]{64}$/.test(rawPrivateKey)) {
      return new Wallet(`0x${rawPrivateKey}`, provider)
    }
    const filePrivateKey = fs.readFileSync(rawPrivateKey, 'ascii').trim()
    return new Wallet(filePrivateKey, provider)
  }

  if (opts.mnemonic != null && opts.mnemonic !== '') {
    return Wallet.fromMnemonic(fs.readFileSync(opts.mnemonic, 'ascii').trim()).connect(provider)
  }

  throw new Error('请通过 --privateKey、--mnemonic 或环境变量 BUNDLER_PRIVATE_KEY 提供充值账户')
}

async function main (): Promise<void> {
  const program = new Command()
    .option('--network <string>', 'RPC 地址或网络名', 'https://chain.metamemo.one:8501')
    .requiredOption('--account <address>', '要充值的地址')
    .requiredOption('--amount <eth>', '充值金额，单位 ETH')
    .option('--privateKey <string>', '私钥字符串或私钥文件路径，优先于 --mnemonic')
    .option('--mnemonic <file>', '助记词文件路径')
    .option('--entryPoint <address>', 'EntryPoint 合约地址', DEFAULT_ENTRY_POINT)

  const opts = program.parse().opts<{
    network: string
    account: string
    amount: string
    privateKey?: string
    mnemonic?: string
    entryPoint: string
  }>()
  const account = getAddress(opts.account)
  const entryPointAddress = getAddress(opts.entryPoint)
  const amount = parseEther(opts.amount)
  const provider = getNetworkProvider(opts.network)

  const code = await provider.getCode(entryPointAddress)
  if (code === '0x') {
    throw new Error(`EntryPoint 未部署: ${entryPointAddress}`)
  }

  const signer = await loadSignerFromOpts(opts, provider)
  const from = await signer.getAddress()
  const entryPoint = IEntryPoint__factory.connect(entryPointAddress, signer)
  const beforeDeposit = await entryPoint.balanceOf(account)

  console.log('Network:', opts.network)
  console.log('EntryPoint:', entryPointAddress)
  console.log('From:', from)
  console.log('Account:', account)
  console.log('Amount:', amount.toString(), `(${opts.amount} ETH)`)
  console.log('Deposit before:', beforeDeposit.toString(), `(${ethers.utils.formatEther(beforeDeposit)} ETH)`)

  const tx = await entryPoint.depositTo(account, { value: amount })
  console.log('Tx hash:', tx.hash)

  const receipt = await tx.wait()
  const afterDeposit = await entryPoint.balanceOf(account)

  console.log('Block number:', receipt.blockNumber)
  console.log('Deposit after:', afterDeposit.toString(), `(${ethers.utils.formatEther(afterDeposit)} ETH)`)
}

void main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error.message)
    process.exit(1)
  })
