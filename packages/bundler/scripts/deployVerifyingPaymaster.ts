/**
 * 独立部署 VerifyingPaymaster 脚本
 *
 * 用法:
 *   # 使用部署者地址作为 verifyingSigner
 *   yarn hardhat run scripts/deployVerifyingPaymaster.ts --network localhost
 *
 *   # 指定 verifyingSigner
 *   VERIFYING_SIGNER=0x1234... yarn hardhat run scripts/deployVerifyingPaymaster.ts --network localhost
 *
 *   # 从私钥文件创建 signer (需先导出地址到 VERIFYING_SIGNER)
 *   # 例如: VERIFYING_SIGNER=$(cast wallet address --private-key $(cat paymaster.pk))
 *   VERIFYING_SIGNER=<地址> yarn hardhat run scripts/deployVerifyingPaymaster.ts --network localhost
 */

import { ethers } from 'hardhat'
import { parseEther } from 'ethers/lib/utils'

// ERC-4337 v0.7 EntryPoint 标准地址，与 bundler config 一致
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT ?? '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

async function main (): Promise<void> {
  const [signer] = await ethers.getSigners()
  const from = await signer.getAddress()

  const entryPointAddress = ENTRY_POINT_ADDRESS
  const entryPointCode = await ethers.provider.getCode(entryPointAddress)
  if (entryPointCode === '0x') {
    console.error('EntryPoint 未部署。请先执行: yarn hardhat-deploy')
    process.exit(1)
  }

  const verifyingSigner = process.env.VERIFYING_SIGNER ?? from
  console.log('部署 VerifyingPaymaster')
  console.log('  entryPoint:', entryPointAddress)
  console.log('  verifyingSigner:', verifyingSigner)

  const VerifyingPaymaster = await ethers.getContractFactory('VerifyingPaymaster')
  const paymaster = VerifyingPaymaster.attach('0x865A869789149B58B058a24950C09869491980c2')
  // const paymaster = VerifyingPaymaster.deploy(entryPointAddress, verifyingSigner)
  await paymaster.deployed()

  const deposit = await paymaster.getDeposit()
  console.log('deposit:', deposit.toString())

  const depositAmount = parseEther('1')
  const stakeAmount = parseEther('2')
  const unstakeDelaySec = 1

  console.log('向 EntryPoint 存入 deposit...')
  await paymaster.deposit({ value: depositAmount })
  console.log('添加 stake...')
  await paymaster.addStake(unstakeDelaySec, { value: stakeAmount })

  console.log('')
  console.log('=== VerifyingPaymaster 部署完成 ===')
  console.log('地址:', paymaster.address)
  console.log('verifyingSigner:', verifyingSigner)
  console.log('')
  console.log('runop2 示例:')
  console.log(`  yarn runop2 --selfBundler --paymasterAddress ${paymaster.address} (bundler 需 --paymasterEnabled)`)
  console.log(`  私钥需对应地址: ${verifyingSigner}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1) })
