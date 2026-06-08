/**
 * 查询 EntryPoint 中指定地址的 deposit / stake 信息。
 *
 * 用法:
 *   yarn --cwd packages/bundler entrypoint:deposit-info --account 0x1234...
 *   yarn --cwd packages/bundler entrypoint:deposit-info --network memo --account 0x1234...
 *   ENTRY_POINT=0x... yarn --cwd packages/bundler entrypoint:deposit-info --network https://rpc.example --account 0x1234...
 */

import { Command } from 'commander'
import { BigNumberish, ethers } from 'ethers'
import { getAddress } from 'ethers/lib/utils'
import { IEntryPoint__factory } from '../src/types/factories/@account-abstraction/contracts/interfaces/IEntryPoint__factory'
import { getNetworkProvider } from '../src/Config'

const DEFAULT_ENTRY_POINT = process.env.ENTRY_POINT ?? '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

function formatEth (wei: BigNumberish): string {
  return `${ethers.utils.formatEther(wei)} ETH`
}

async function main (): Promise<void> {
  const program = new Command()
    .option('--network <string>', 'RPC 地址或网络名', 'https://chain.metamemo.one:8501')
    .requiredOption('--account <address>', '要查询的地址')
    .option('--entryPoint <address>', 'EntryPoint 合约地址', DEFAULT_ENTRY_POINT)

  const opts = program.parse().opts<{ network: string, account: string, entryPoint: string }>()
  const account = getAddress(opts.account)
  const entryPointAddress = getAddress(opts.entryPoint)
  const provider = getNetworkProvider(opts.network)

  const code = await provider.getCode(entryPointAddress)
  if (code === '0x') {
    throw new Error(`EntryPoint 未部署: ${entryPointAddress}`)
  }

  const entryPoint = IEntryPoint__factory.connect(entryPointAddress, provider)
  const info = await entryPoint.getDepositInfo(account)

  console.log('Network:', opts.network)
  console.log('EntryPoint:', entryPointAddress)
  console.log('Account:', account)
  console.log('deposit:', info.deposit.toString(), `(${formatEth(info.deposit)})`)
  console.log('staked:', info.staked)
  console.log('stake:', info.stake.toString(), `(${formatEth(info.stake)})`)
  console.log('unstakeDelaySec:', info.unstakeDelaySec.toString())
  console.log('withdrawTime:', info.withdrawTime.toString())

  if (info.withdrawTime > 0) {
    console.log('withdrawTime(iso):', new Date(info.withdrawTime * 1000).toISOString())
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error.message)
    process.exit(1)
  })
