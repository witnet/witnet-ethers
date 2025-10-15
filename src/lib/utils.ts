import { Witnet } from "@witnet/sdk"
import WSB from "@witnet/solidity"
import * as cbor from "cbor"
import { AbiCoder, Contract, JsonRpcProvider, solidityPackedKeccak256 } from "ethers"
import { default as merge } from "lodash.merge"

import {
    WitOracle,
    WitOracleRadonRegistry,
    WitOracleRadonRequestFactory,
    WitPriceFeeds,
    WitPriceFeedsLegacy,
    WitRandomness,
} from "./wrappers"

import {
    flattenObject,
    getNetworkAddresses as _getNetworkAddresses,
    getNetworkArtifacts as _getNetworkArtifacts,
    getNetworkConstructorArgs as _getNetworkConstructorArgs,
    readWitnetJsonFiles
} from "../bin/helpers.js"

import { 
    DataPushReport, 
    PriceFeedUpdateConditions, 
    WitOracleArtifact, 
    WitOracleQueryParams, 
    WitOracleQueryStatus 
} from "./types"

export * from "@witnet/sdk/utils"

export const ABIs = WSB.ABIs;

export async function fetchWitOracleFramework(provider: JsonRpcProvider): Promise<{ [key: string]: WitOracleArtifact }> {
    return provider
        .getNetwork()
        .then(async value => {
            const network = getEvmNetworkByChainId(Number(value.chainId))
            if (network) {
                const exclusions = [
                    "WitOracleRadonRequestFactoryModals",
                    "WitOracleRadonRequestFactoryTemplates",
                ]
                const targets = [
                    "WitOracle",
                    "WitOracleRadonRegistry",
                    "WitOracleRadonRequestFactory",
                    "WitPriceFeeds",
                    "WitPriceFeedsLegacy",
                    "WitRandomnessV2",
                    "WitRandomnessV3",
                ]
                const contracts = Object.fromEntries(
                    Object.entries(flattenObject(_getNetworkArtifacts(network)))
                        .map(([key, value]) => [key.split(".").pop(), value])
                );
                let { addresses } = readWitnetJsonFiles("addresses")
                addresses = merge(_getNetworkAddresses(network), addresses[network])
                return await Promise.all(
                    Object.entries(flattenObject(addresses))
                        .map(([key, address]) => [
                            key.split(".").pop(),
                            address
                        ])
                        .sort(([a], [b]) => (a as string).localeCompare(b))
                        .filter(([key,]) => {
                            const base = _findBase(contracts, key)
                            return (
                                targets.includes(key)
                                && !exclusions.includes(base)
                                && (ABIs[key] || ABIs[base])
                            )
                        })
                        .map(async ([key, address]) => {
                            const bytecode = await provider.getCode(address).catch(err => console.error(`Warning: ${key}: ${err}`))
                            if (bytecode?.length && bytecode.length > 2) {
                                let impl, isUpgradable = false, interfaceId, version
                                const appliance = new Contract(address, ABIs.WitAppliance, provider)
                                try { impl = await appliance.class.staticCall() } catch { impl = key }
                                try { interfaceId = await appliance.specs.staticCall() } catch { }
                                const upgradable = new Contract(address, ABIs.WitnetUpgradableBase, provider)
                                try { isUpgradable = await upgradable.isUpgradable.staticCall() } catch { isUpgradable = false }
                                try { version = await upgradable.version.staticCall() } catch { }
                                return [
                                    key,
                                    {
                                        abi: ABIs[key] || ABIs[impl],
                                        address,
                                        class: impl,
                                        gitHash: _versionLastCommitOf(version),
                                        interfaceId,
                                        isUpgradable,
                                        semVer: _versionTagOf(version),
                                        version,
                                    } as WitOracleArtifact
                                ]
                            } else {
                                return [key, undefined]
                            }
                        })
                    )
                    .then(artifacts => artifacts.filter(([, artifact]) => artifact !== undefined))
                    .then(async artifacts => {
                        if (Object.fromEntries(artifacts).WitOracle) {
                            const signer = await provider.getSigner()
                            const witOracle = new WitOracle(signer, network)
                            let witOracleRadonRegistry: WitOracleRadonRegistry
                            if (Object.fromEntries(artifacts).WitOraclRadonRegistry) {
                                witOracleRadonRegistry = new WitOracleRadonRegistry(signer, network);
                            }
                            artifacts = await Promise.all(
                                artifacts.map(async ([key, artifact]) => {
                                    let wrapper
                                    switch (key) {
                                        case "WitOracle": wrapper = witOracle; break;
                                        case "WitOracleRadonRegistry": wrapper = witOracleRadonRegistry; break;
                                        case "WitOracleRadonRequestFactory":
                                            if (witOracleRadonRegistry) {
                                                wrapper = await WitOracleRadonRequestFactory.deployed(witOracle, witOracleRadonRegistry);
                                            };
                                            break;
                                        case "WitPriceFeeds": wrapper = await WitPriceFeeds.at(witOracle, artifact.address); break;
                                        case "WitPriceFeedsLegacy": wrapper = await WitPriceFeedsLegacy.at(witOracle, artifact.address); break;
                                        default:
                                            if (key.startsWith("WitRandomness") || key.startsWith("WitnetRandomness")) {
                                                wrapper = await WitRandomness.at(witOracle, artifact.address);
                                            }
                                    }
                                    return [
                                        key,
                                        { ...artifact, wrapper } as WitOracleArtifact
                                    ]
                                })
                            );
                        }
                        return Object.fromEntries(artifacts)
                    })

            } else {
                return {}
            }
        });
}

function _findBase(obj: { [k: string]: any; }, value: string): string {
    return Object.entries(obj).find(([, impl]) => impl === value)?.[0] || ""
}
function _versionTagOf(version?: string) { return version?.slice(0, 5) }
function _versionLastCommitOf(version?: string) {
    if (version) {
        return version?.length >= 21 ? version?.slice(-15, -8) : ""
    } else {
        return undefined
    }
}

export function getEvmNetworkAddresses(network: string): any {
    return _getNetworkAddresses(network)
}

export function getEvmNetworkByChainId(chainId: number): string | undefined {
    const found = Object.entries(WSB.supportedNetworks()).find(([, config]: [string, any]) => config?.network_id.toString() === chainId.toString())
    if (found) return found[0];
    else return undefined;
}

export function getEvmNetworkSymbol(network: string): string {
    const found = Object.entries(WSB.supportedNetworks()).find(([key,]: [string, any]) => key.toLowerCase() === network.toLowerCase())
    if (found) return (found[1] as any)?.symbol;
    else return "ETH"
}

export function getEvmNetworks(): string[] {
    return Object.keys(WSB.supportedNetworks())
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

export function abiEncodeDataPushReportMessage(report: DataPushReport): Witnet.HexString {
    return AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "(uint16, uint16, uint64)", "uint64", "bytes"],
        abiEncodeDataPushReport(report)
    )
}

export function abiEncodeDataPushReportDigest(report: DataPushReport): Witnet.HexString {
    return solidityPackedKeccak256(
        ["bytes"],
        [abiEncodeDataPushReportMessage(report)],
    )
}

export function abiEncodePriceFeedUpdateConditions(conditions: PriceFeedUpdateConditions): any {
    return [
        conditions.callbackGas,
        conditions.computeEMA,
        conditions.cooldownSecs,
        conditions.heartbeatSecs,
        Math.floor(conditions.maxDeviationPercentage * 10),
        conditions.minWitnesses,
    ]
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
