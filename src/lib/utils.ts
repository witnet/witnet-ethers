import * as cbor from "cbor"
import { AbiCoder, solidityPackedKeccak256 } from "ethers"
import { Witnet } from "@witnet/sdk"

import WSB from "witnet-solidity-bridge"

import {
    getNetworkAddresses as _getNetworkAddresses,
    getNetworkConstructorArgs as _getNetworkConstructorArgs,
} from "../bin/helpers"

import { DataPushReport, WitOracleQueryParams, WitOracleQueryStatus } from "./types"
import { HexString } from "node_modules/ethers/lib.commonjs/utils/data"

export * from "@witnet/sdk/utils"

export const ABIs = WSB.ABIs;

export function getEvmNetworkAddresses(network: string): any {
    return _getNetworkAddresses(network)
}

export function getEvmNetworkByChainId(chainId: number): string | undefined {
    const found = Object.entries(WSB.supportedNetworks()).find(([, config]: [string, any]) => config?.network_id.toString() === chainId.toString())
    if (found) return found[0];
    else return undefined;
}

export function isEvmNetworkMainnet(network: string): boolean {
    const found = Object.entries(WSB.supportedNetworks()).find(([key,]) => key === network.toLowerCase())
    return (found as any)?.[1].mainnet
}

export function isEvmNetworkSupported(network: string): boolean {
    return WSB.supportsNetwork(network)
}

export function abiDecodeQueryStatus(status: bigint): WitOracleQueryStatus {
    switch (status) {
        case 1n: return "Posted";
        case 2n: return "Reported";
        case 3n: return "Finalized";
        case 4n: return "Delayed";
        case 5n: return "Expired";
        case 6n: return "Disputed";
        default: return "Void";
    }
}

export function abiDecodePriceFeedMappingAlgorithm(algorithm: bigint): string {
    switch (algorithm) {
        case 1n: return "Fallback";
        case 2n: return "Hottest";
        case 3n: return "Product";
        default: return "None";
    }
}

/**
 * Contains information about the resolution of some Data Request Transaction in the Witnet blockchain.
 */
type _DataPushReportSolidity = {
    /**
     * Unique hash of the Data Request Transaction that produced the outcoming result. 
     */
    drTxHash: Witnet.Hash,
    /**
     * RAD hash of the Radon Request being solved.
     */
    queryRadHash: Witnet.Hash,
    /**
     * SLA parameters required to be fulfilled by the Witnet blockchain. 
     */
    queryParams: WitOracleQueryParams,
    /**
     * Timestamp when the data sources where queried and the contained result produced.
     */
    resultTimestamp: number,
    /**
     * CBOR-encoded buffer containing the actual result data to some query as solved by the Witnet blockchain. 
     */
    resultCborBytes: Witnet.HexString,
}

function _intoDataPushReportSolidity(report: DataPushReport): _DataPushReportSolidity {
    return {
        drTxHash: `0x${report.hash}`,
        queryParams: {
            witnesses: report.query?.witnesses || 0,
            unitaryReward: report.query?.unitary_reward || 0n,
            resultMaxSize: 0,
        },
        queryRadHash: `0x${report.query?.rad_hash}`,
        resultCborBytes: `0x${report.result?.cbor_bytes}`,
        resultTimestamp: report.result?.timestamp || 0,
    }
}

export function abiEncodeDataPushReport(report: DataPushReport): any {
    const internal = _intoDataPushReportSolidity(report)
    return [
        internal.drTxHash,
        internal.queryRadHash,
        abiEncodeWitOracleQueryParams(internal.queryParams),
        internal.resultTimestamp,
        internal.resultCborBytes,
    ]
}

export function abiEncodeDataPushReportMessage(report: DataPushReport): HexString {
    return AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "(uint16, uint16, uint64)", "uint64", "bytes"],
        abiEncodeDataPushReport(report)
    )
}

export function abiEncodeDataPushReportDigest(report: DataPushReport): HexString {
    return solidityPackedKeccak256(
        ["bytes"],
        [abiEncodeDataPushReportMessage(report)],
    )
}

export function abiEncodeWitOracleQueryParams(queryParams: WitOracleQueryParams): any {
    return [
        queryParams?.resultMaxSize || 0,
        queryParams?.witnesses || 0,
        queryParams?.unitaryReward || 0,
    ]
}
export function abiEncodeRadonAsset(asset: any): any {
    if (asset instanceof Witnet.Radon.RadonRetrieval) {
        return [
            asset.method,
            asset.url || "",
            asset.body || "",
            asset?.headers ? Object.entries(asset.headers) : [],
            abiEncodeRadonAsset(asset.script) || "0x80",
        ]

    } else if (asset instanceof Witnet.Radon.types.RadonScript) {
        return asset.toBytecode()

    } else if (asset instanceof Witnet.Radon.reducers.Class) {
        return [
            asset.opcode,
            asset.filters?.map(filter => abiEncodeRadonAsset(filter)) || [],
        ]

    } else if (asset instanceof Witnet.Radon.filters.Class) {
        return [
            asset.opcode,
            `0x${asset.args ? cbor.encode(asset.args).toString("hex") : ""}`
        ]

    } else {
        throw new TypeError(`Not a Radon asset: ${asset}`)
    }
}

export function decodeCborBytes(_cborBytes: Witnet.HexString): any { }
