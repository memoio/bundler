/**
 * PaymasterAPI 实现：通过调用 bundler 的 pm_signPaymasterData 接口获取签名后的 paymasterData。
 * 适用于 bundler 以 --paymasterEnabled 启动时的场景，客户端无需持有 paymaster 私钥。
 */

import { defaultAbiCoder, hexConcat, resolveProperties } from 'ethers/lib/utils'
import { JsonRpcProvider } from '@ethersproject/providers'
import { PaymasterAPI, PaymasterParams } from './PaymasterAPI'
import { UserOperation, deepHexlify, unpackPaymasterAndData } from '@account-abstraction/utils'

const maxUint48 = (2 ** 48) - 1

export interface VerifyingPaymasterAPIParams {
  /** Bundler RPC URL，如 http://localhost:3000/rpc */
  bundlerUrl: string
  /** VerifyingPaymaster 合约地址（需与 bundler 配置一致） */
  paymasterAddress: string
  /** 链 ID，用于 JsonRpcProvider */
  chainId: number
  validUntil?: number
  validAfter?: number
}

/**
 * 通过 bundler API 获取 VerifyingPaymaster 签名的 PaymasterAPI。
 * 要求 bundler 以 --paymasterEnabled 启动。
 */
export class VerifyingPaymasterAPI extends PaymasterAPI {
  private readonly bundlerProvider: JsonRpcProvider

  constructor (
    readonly bundlerUrl: string,
    readonly paymasterAddress: string,
    readonly chainId: number,
    readonly validUntil: number = maxUint48,
    readonly validAfter: number = 0
  ) {
    super()
    this.bundlerProvider = new JsonRpcProvider(bundlerUrl, {
      name: 'bundler',
      chainId
    })
  }

  async getPlaceholderPaymasterData (): Promise<PaymasterParams | null> {
    const paymasterVerificationGasLimit = 150000
    const paymasterPostOpGasLimit = 0
    const placeholderSig = '0x' + '00'.repeat(65)
    const placeholderPaymasterData = hexConcat([
      defaultAbiCoder.encode(['uint48', 'uint48'], [this.validUntil, this.validAfter]),
      placeholderSig
    ])
    return {
      paymaster: this.paymasterAddress,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit,
      paymasterData: placeholderPaymasterData
    }
  }

  async getTemporaryPaymasterData (userOp: Partial<UserOperation>): Promise<PaymasterParams | null> {
    const hexifiedUserOp = deepHexlify(await resolveProperties(userOp as any))
    const paymasterAndData = await this.bundlerProvider.send('pm_signPaymasterData', [hexifiedUserOp])
    const unpacked = unpackPaymasterAndData(paymasterAndData)
    if (unpacked == null) {
      throw new Error('Bundler returned invalid paymasterAndData')
    }
    if (unpacked.paymaster.toLowerCase() !== this.paymasterAddress.toLowerCase()) {
      throw new Error(`Bundler paymaster ${unpacked.paymaster} does not match expected ${this.paymasterAddress}`)
    }
    return {
      paymaster: unpacked.paymaster,
      paymasterData: unpacked.paymasterData,
      paymasterVerificationGasLimit: unpacked.paymasterVerificationGas,
      paymasterPostOpGasLimit: unpacked.postOpGasLimit
    }
  }

  async getPaymasterData (userOp: Partial<UserOperation>): Promise<PaymasterParams | null> {
    return await this.getTemporaryPaymasterData(userOp)
  }
}
