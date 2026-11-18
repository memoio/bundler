import { utils } from 'ethers'

const account = new utils.Interface(['function execute(address dest,uint256 value,bytes func)'])
const registry = new utils.Interface(['function createDIDFrom(string did,uint256 serialNumber)'])

export function isSponsoredDidCreation (callData: string, didProxy: string): boolean {
  try {
    const [target, value, data] = account.decodeFunctionData('execute', callData)
    if (target.toLowerCase() !== didProxy.toLowerCase() || !value.isZero()) return false
    if (account.encodeFunctionData('execute', [target, value, data]).toLowerCase() !== callData.toLowerCase()) return false
    const [did, serial] = registry.decodeFunctionData('createDIDFrom', data)
    return /^[0-9a-f]{64}$/.test(did) &&
      registry.encodeFunctionData('createDIDFrom', [did, serial]).toLowerCase() === data.toLowerCase()
  } catch {
    return false
  }
}
