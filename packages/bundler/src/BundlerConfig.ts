// TODO: consider adopting config-loading approach from hardhat to allow code in config file
import ow from 'ow'

const MIN_UNSTAKE_DELAY = 86400
const MIN_STAKE_VALUE = 1e18.toString()
export interface BundlerConfig {
  beneficiary: string
  entryPoint: string
  gasFactor: string
  minBalance: string
  mnemonic: string
  privateKey?: string
  network: string
  port: string
  unsafe: boolean
  debugRpc?: boolean
  conditionalRpc: boolean

  whitelist?: string[]
  blacklist?: string[]
  maxBundleGas: number
  minStake: string
  minUnstakeDelay: number
  autoBundleInterval: number
  autoBundleMempoolSize: number

  /** 是否启用 Paymaster 模式（bundler 提供 pm_signPaymasterData 接口） */
  paymasterEnabled: boolean
  /** VerifyingPaymaster 合约地址 */
  paymasterAddress?: string
  /** Paymaster verifyingSigner 私钥 */
  paymasterOwnerSK?: string
  /** Paymaster 最少 deposit（wei），低于此值启动失败 */
  minPaymasterDeposit?: string
}

// TODO: implement merging config (args -> config.js -> default) and runtime shape validation
export const BundlerConfigShape = {
  beneficiary: ow.string,
  entryPoint: ow.string,
  gasFactor: ow.string,
  minBalance: ow.string,
  mnemonic: ow.string,
  privateKey: ow.optional.string,
  network: ow.string,
  port: ow.string,
  unsafe: ow.boolean,
  debugRpc: ow.optional.boolean,
  conditionalRpc: ow.boolean,

  whitelist: ow.optional.array.ofType(ow.string),
  blacklist: ow.optional.array.ofType(ow.string),
  maxBundleGas: ow.number,
  minStake: ow.string,
  minUnstakeDelay: ow.number,
  autoBundleInterval: ow.number,
  autoBundleMempoolSize: ow.number,

  paymasterEnabled: ow.boolean,
  paymasterAddress: ow.optional.string,
  paymasterOwnerSK: ow.optional.string,
  minPaymasterDeposit: ow.optional.string
}

// TODO: consider if we want any default fields at all
// TODO: implement merging config (args -> config.js -> default) and runtime shape validation
export const bundlerConfigDefault: Partial<BundlerConfig> = {
  port: '3000',
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  unsafe: false,
  conditionalRpc: false,
  minStake: MIN_STAKE_VALUE,
  minUnstakeDelay: MIN_UNSTAKE_DELAY,
  paymasterEnabled: false
}
