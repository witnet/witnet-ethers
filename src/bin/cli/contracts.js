const { JsonRpcProvider } = require("ethers")
const helpers = require("../helpers.js")
const { utils } = require("../../../dist/src/lib")

const deployables = helpers.readWitnetJsonFiles("templates", "modals")

module.exports = async function (flags = {}, params = []) {
  let [args] = helpers.deleteExtraFlags(params)

  let provider
  try {
    provider = new JsonRpcProvider(`http://127.0.0.1:${flags?.port || 8545}`)
  } catch (err) {
    throw new Error(`Unable to connect to local ETH/RPC gateway: ${err.message}`)
  }

  const chainId = (await provider.getNetwork()).chainId
  const network = utils.getEvmNetworkByChainId(chainId)
  if (!network) {
    throw new Error(`Connected to unsupported EVM chain id: ${chainId}`)
  }
  
  let artifacts = {}
  if (flags?.templates || flags?.modals) {
    const assets = helpers.importRadonAssets(flags)
    if (flags?.templates) {
      const dict = utils.flattenRadonTemplates(assets)
      if (Object.keys(dict).length > 0 && deployables.templates[network]) {
        artifacts.templates = Object.fromEntries(
          Object
            .entries(deployables.templates[network])
            .filter(([key]) => dict[key] !== undefined) 
            .map(([key, address]) => [key, { address }])
        )
      }
    }
    if (flags?.modals) {
      const dict = utils.flattenRadonModals(assets)
      if (Object.keys(dict).length > 0 && deployables.modals[network]) {
        artifacts.modals = Object.fromEntries(
          Object
            .entries(deployables.modals[network])
            .filter(([key]) => dict[key] !== undefined)
            .map(([key, address]) => [key, { address }])
        )
      }
    }   
  } else {
    const framework = await helpers.prompter(utils.getWitAppliances(provider))
    artifacts = Object.entries(framework)
    if (!args || args.length === 0) {
      args = ["WitOracle"]
    }
  }
  helpers.traceHeader(`${network.toUpperCase()}`, helpers.colors.lcyan)
  helpers.traceTable(
    artifacts.map(([key, obj]) => {
      const match = includes(args, key)
      return [
        match ? helpers.colors.lwhite(key) : helpers.colors.white(key),
        match ? helpers.colors.mblue(obj.address) : helpers.colors.blue(obj.address),
        match ? helpers.colors.mgreen(obj?.interfaceId || "") : helpers.colors.green(obj?.interfaceId || ""),
        ...(flags?.verbose ? [
          match ? helpers.colors.myellow(obj?.class || "") : helpers.colors.yellow(obj?.class || ""),
          helpers.colors.gray(obj?.version || ""),
        ] : [])
      ]
    }), {
      headlines: [ 
        ":WIT/ORACLE FRAMEWORK", 
        ":EVM CONTRACT ADDRESS",
        ":EVM SPECS", 
        ...(flags?.verbose ? [":EVM CONTRACT CLASS", ":EVM VERSION TAG" ] : []) 
      ],
    }
  )
}

const findBase = (obj, value) => {
  Object.entries(obj).find(([, impl]) => impl === value)?.[0]
}

const includes = (selection, key) => {
    return selection.filter(
      artifact => key.toLowerCase().endsWith(artifact.toLowerCase())
    ).length > 0
  }