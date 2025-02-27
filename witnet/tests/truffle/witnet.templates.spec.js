const utils = require("../../scripts/utils")

const WitOracleRequest = artifacts.require("WitOracleRequest")
const WitOracleRequestTemplate = artifacts.require("WitOracleRequestTemplate")

contract("witnet-solidity/templates", async () => {
  const [, network] = utils.getRealmNetworkFromArgs()
  const addresses = require("./addresses")[network]
  const selection = utils.getWitnetArtifactsFromArgs()
  const templates = (process.argv.includes("--legacy")
    ? require(
      `${process.env.WITNET_SOLIDITY_ASSETS_PATH || process.env.WITNET_SOLIDITY_REQUIRE_RELATIVE_PATH || "../../../../../witnet"}/assets`
    ).templates
    : require(
      `${process.env.WITNET_SOLIDITY_ASSETS_PATH || process.env.WITNET_SOLIDITY_REQUIRE_RELATIVE_PATH || "../../../../../witnet"}/assets/templates`
    )
  )

  const summary = []

  describe("My Witnet Request Templates...", async () => {
    if (addresses?.templates) {
      const crafts = utils.flattenRadonAssets(templates)
      crafts.forEach(async (craft) => {
        const templateAddress = addresses?.templates[craft?.key] || ""
        if (
          templateAddress !== "" &&
            (selection.length === 0 || selection.includes(craft?.key))
        ) {
          describe(`${craft.key}`, async () => {
            for (const test in craft.artifact?.tests) {
              describe(`${test}`, async () => {
                const args = craft.artifact.tests[test]
                let bytecode
                it("parameterized request gets built", async () => {
                  const template = await WitOracleRequestTemplate.at(templateAddress)
                  await template.verifyRadonRequest(args)
                })
                it("parameterized request dryruns successfully", async () => {
                  const template = await WitOracleRequestTemplate.at(templateAddress)
                  const tx = await template.methods["buildWitOracleRequest(string[][])"](args)
                  const events = tx.logs.filter(log => log.event === "WitOracleRequestBuilt")
                  assert(events.length > 0, "No WitOracleRequest contract was built!")
                  const request = await WitOracleRequest.at(events[0].args.request)
                  // const radHash = await request.radHash.call()
                  bytecode = (await request.bytecode.call()).slice(2)
                  const output = await utils.dryRunBytecode(bytecode)
                  let json
                  try {
                    json = JSON.parse(output)
                  } catch {
                    assert(false, "Invalid JSON: " + output)
                  }
                  const result = utils.processDryRunJson(json)
                  summary.push({
                    Artifact: craft.key,
                    Test: test,
                    Status: result.status,
                    "✓ Sources": result.totalSources - result.nokSources,
                    "∑ Sources": result.totalSources,
                    "Time (secs)": result.runningTime,
                    Result: !("RadonError" in result.tally) ? result.tally : "(Failed)",
                  })
                  if (result.status !== "OK") {
                    throw Error(result?.error || "Dry-run-failed!")
                  }
                })
                after(async () => {
                  if (process.argv.includes("--verbose")) {
                    const output = await utils.dryRunBytecodeVerbose(bytecode)
                    console.info(output.split("\n").slice(0, -1).join("\n"))
                    console.info("-".repeat(120))
                  }
                })
              })
            }
          })
        }
      })
    }
    after(async () => {
      if (summary.length > 0) {
        console.info(`\n${"=".repeat(148)}\n> TEMPLATE DRY-RUNS:`)
        console.table(summary)
      }
    })
  })
})
