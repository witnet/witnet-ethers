import { Interface, InterfaceAbi, JsonRpcSigner } from "ethers"
import { ABIs, getEvmNetworkAddresses } from "../utils"
import { ContractWrapper } from "./ContractWrapper"

export abstract class WitArtifact extends ContractWrapper {
    constructor (signer: JsonRpcSigner, network: string, artifact: string, at?: string) {
        const abis: Record<string, Interface | InterfaceAbi> = ABIs
        const target = at || getEvmNetworkAddresses(network)?.core[artifact]
        if (!abis[artifact] || !target) {
            throw new Error(`EVM network ${network} => artifact is not available: ${artifact}`)
        } else {
            super(signer, network, abis[artifact], target)
        }
    }
}

