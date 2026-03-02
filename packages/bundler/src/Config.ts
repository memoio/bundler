import ow from 'ow'
import fs from 'fs'

import { BundlerConfig, bundlerConfigDefault, BundlerConfigShape } from './BundlerConfig'
import { Wallet, Signer } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'

function getCommandLineParams (programOpts: any): Partial<BundlerConfig> {
  const params: any = {}
  for (const bundlerConfigShapeKey in BundlerConfigShape) {
    const optionValue = programOpts[bundlerConfigShapeKey]
    if (optionValue != null) {
      params[bundlerConfigShapeKey] = optionValue
    }
  }
  return params as BundlerConfig
}

function mergeConfigs (...sources: Array<Partial<BundlerConfig>>): BundlerConfig {
  const mergedConfig = Object.assign({}, ...sources)
  ow(mergedConfig, ow.object.exactShape(BundlerConfigShape))
  return mergedConfig
}

const DEFAULT_INFURA_ID = 'd442d82a1ab34327a7126a578428dfc4'

export function getNetworkProvider (url: string): JsonRpcProvider {
  if (url.match(/^[\w-]+$/) != null) {
    const infuraId = process.env.INFURA_ID1 ?? DEFAULT_INFURA_ID
    url = `https://${url}.infura.io/v3/${infuraId}`
  }
  console.log('url=', url)
  return new JsonRpcProvider(url)
}

function resolvePaymasterSK (raw: string): string {
  return (raw.startsWith('0x') && raw.length === 66) || raw.length === 64
    ? (raw.startsWith('0x') ? raw : '0x' + raw)
    : fs.readFileSync(raw, 'ascii').trim()
}

export async function resolveConfiguration (programOpts: any): Promise<{
  config: BundlerConfig
  provider: JsonRpcProvider
  wallet: Signer
  paymasterWallet?: Wallet
}> {
  const commandLineParams = getCommandLineParams(programOpts)
  let fileConfig: Partial<BundlerConfig> = {}
  const configFileName = programOpts.config
  if (fs.existsSync(configFileName)) {
    fileConfig = JSON.parse(fs.readFileSync(configFileName, 'ascii'))
  }
  const config = mergeConfigs(bundlerConfigDefault, fileConfig, commandLineParams)
  console.log('Merged configuration:', JSON.stringify(config))

  if (config.network === 'hardhat') {
    // eslint-disable-next-line
    const provider: JsonRpcProvider = require('hardhat').ethers.provider
    return { config, provider, wallet: provider.getSigner() }
  }

  const provider = getNetworkProvider(config.network)
  let wallet: Wallet
  // 优先使用私钥进行签名
  const privatekey = process.env.BUNDLER_PRIVATE_KEY ?? config.privateKey
  if (privatekey != null && privatekey !== '') {
    try {
      // 若以 0x 开头且长度为 66，则视为直接的私钥字符串
      const privateKey = privatekey.startsWith('0x') && privatekey.length === 66
        ? privatekey
        : privatekey.length === 64 ? '0x' + privatekey : fs.readFileSync(privatekey, 'ascii').trim()
      wallet = new Wallet(privateKey).connect(provider)
    } catch (e: any) {
      throw new Error(`Unable to read --privateKey ${config.privateKey}: ${e.message as string}`)
    }
  } else {
    try {
      const mnemonic = fs.readFileSync(config.mnemonic, 'ascii').trim()
      wallet = Wallet.fromMnemonic(mnemonic).connect(provider)
    } catch (e: any) {
      throw new Error(`Unable to read --mnemonic ${config.mnemonic}: ${e.message as string}`)
    }
  }

  let paymasterWallet: Wallet | undefined
  const paymasterSK = process.env.PAYMASTER_PRIVATE_KEY ?? config.paymasterOwnerSK
  if (paymasterSK != null && paymasterSK !== '') {
    try {
      const sk = resolvePaymasterSK(paymasterSK)
      paymasterWallet = new Wallet(sk).connect(provider)
    } catch (e: any) {
      throw new Error(`Unable to read PAYMASTER_PRIVATE_KEY: ${e.message as string}`)
    }
  }

  return { config, provider, wallet, paymasterWallet }
}
