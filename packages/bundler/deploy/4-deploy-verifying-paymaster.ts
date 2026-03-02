/**
 * 部署 VerifyingPaymaster 合约
 *
 * 环境变量：
 *   VERIFYING_SIGNER - 验证签名者地址，若不设置则使用部署者地址
 *
 * 部署后需：
 *   1. 向 EntryPoint 存入 ETH：paymaster.deposit{value: amount}()
 *   2. 添加质押：paymaster.addStake(unstakeDelaySec, {value: amount})
 */

import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { ethers } from 'hardhat'
import { parseEther } from 'ethers/lib/utils'

const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT ?? '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

const deployVerifyingPaymaster: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre
  const provider = ethers.provider
  const signer = provider.getSigner()
  const from = await signer.getAddress()

  const net = await provider.getNetwork()
  if (net.chainId !== 1337 && net.chainId !== 31337) {
    console.log('VerifyingPaymaster: 仅在 localhost 自动部署，其他网络请手动部署')
    return
  }

  const entryPointAddress = ENTRY_POINT_ADDRESS
  if ((await provider.getCode(entryPointAddress)) === '0x') {
    console.log('EntryPoint 未部署，请先执行: yarn hardhat-deploy')
    return
  }

  const verifyingSigner = process.env.VERIFYING_SIGNER ?? from
  console.log('部署 VerifyingPaymaster: entryPoint=', entryPointAddress, 'verifyingSigner=', verifyingSigner)

  const paymaster = await deployments.deploy('VerifyingPaymaster', {
    from,
    args: [entryPointAddress, verifyingSigner],
    gasLimit: 3e6,
    log: true
  })

  if (paymaster.newlyDeployed) {
    const pm = await ethers.getContractAt('VerifyingPaymaster', paymaster.address)
    const depositAmount = parseEther('1')
    const stakeAmount = parseEther('2')
    const unstakeDelaySec = 1

    console.log('向 EntryPoint 存入', depositAmount.toString(), 'wei')
    await pm.deposit({ value: depositAmount })
    console.log('添加质押', stakeAmount.toString(), 'wei, unstakeDelay=', unstakeDelaySec)
    await pm.addStake(unstakeDelaySec, { value: stakeAmount })

    console.log('')
    console.log('=== VerifyingPaymaster 部署完成 ===')
    console.log('地址:', paymaster.address)
    console.log('verifyingSigner:', verifyingSigner)
    console.log('')
    console.log('使用 runop2 测试:')
    console.log('  yarn runop2 --selfBundler --paymasterAddress', paymaster.address, '(bundler 需 --paymasterEnabled)')
    console.log('  私钥需对应地址:', verifyingSigner)
  }
}

export default deployVerifyingPaymaster
