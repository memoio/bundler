/**
 * Bundler 内嵌 Paymaster 签名服务。
 * 使用 paymasterOwnerSK 对 UserOp 进行 VerifyingPaymaster 签名，返回 paymasterAndData。
 */

import { arrayify, defaultAbiCoder, hexConcat } from 'ethers/lib/utils'
import { Provider } from '@ethersproject/providers'
import { Wallet } from 'ethers'
import { UserOperation } from '@account-abstraction/utils'
import { packPaymasterData, packUserOp } from '@account-abstraction/utils'
import { calcPreVerificationGas } from '@account-abstraction/sdk'
import { VerifyingPaymaster__factory } from '../types/factories/@account-abstraction/contracts/samples/VerifyingPaymaster__factory'

const maxUint48 = (2 ** 48) - 1

export interface PaymasterSignerParams {
  paymasterAddress: string
  signer: Wallet
  provider: Provider
  validUntil?: number
  validAfter?: number
}

export class PaymasterSigner {
  constructor (
    readonly paymasterAddress: string,
    readonly signer: Wallet,
    readonly provider: Provider,
    readonly validUntil: number = maxUint48,
    readonly validAfter: number = 0
  ) {}

  /**
   * 对 UserOp 进行 Paymaster 签名，返回 paymasterAndData。
   * @param userOp 完整的 UserOperation（需包含 preVerificationGas 等）
   * @returns paymasterAndData hex 字符串
   */
  async signPaymasterData (userOp: UserOperation): Promise<string> {
    const paymasterVerificationGasLimit = 150000
    const paymasterPostOpGasLimit = 0

    const userOpFilled: UserOperation = {
      ...userOp,
      sender: userOp.sender!,
      nonce: userOp.nonce ?? 0,
      callData: userOp.callData ?? '0x',
      callGasLimit: userOp.callGasLimit ?? 0,
      verificationGasLimit: userOp.verificationGasLimit ?? 150000,
      preVerificationGas: userOp.preVerificationGas ?? 21000,
      maxFeePerGas: userOp.maxFeePerGas ?? 0,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas ?? 0,
      signature: userOp.signature ?? '0x',
      paymaster: this.paymasterAddress,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit,
      paymasterData: '0x' // 占位，getHash 不依赖 paymasterData 内容
    } as UserOperation

    const paymasterContract = VerifyingPaymaster__factory.connect(this.paymasterAddress, this.provider)
    const packedUserOp = packUserOp(userOpFilled)

    const hash = await paymasterContract.getHash(packedUserOp, this.validUntil, this.validAfter)
    const signature = await this.signer.signMessage(arrayify(hash))

    const paymasterData = hexConcat([
      defaultAbiCoder.encode(['uint48', 'uint48'], [this.validUntil, this.validAfter]),
      signature
    ])

    return packPaymasterData(
      this.paymasterAddress,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit,
      paymasterData
    ) as string
  }
}
