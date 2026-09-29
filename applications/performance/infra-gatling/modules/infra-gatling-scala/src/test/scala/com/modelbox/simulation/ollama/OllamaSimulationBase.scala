package com.modelbox.simulation.ollama

import com.modelbox.config.ollama.OllamaConfig
import com.modelbox.gatling.{GatlingConfig, GatlingWorkloadProfile}
import io.gatling.core.Predef._
import io.gatling.http.Predef._
import io.gatling.core.structure.{PopulationBuilder, ScenarioBuilder}
import org.slf4j.LoggerFactory
import scala.concurrent.duration._

abstract class OllamaSimulationBase(profileName: String, runLabel: String) extends Simulation {
  private val logger = LoggerFactory.getLogger(classOf[OllamaSimulationBase])
  private val moduleName = "infra-gatling-scala"

  private val runtimeTaggedLabel = s"$runLabel-scala"

  private val baseUrl = OllamaConfig.baseUrl
  private val modelName = OllamaConfig.model
  private val modelTaggedLabel = s"$runtimeTaggedLabel [model=$modelName]"
  protected val profile: GatlingWorkloadProfile = GatlingConfig.resolveProfile(profileName)

  logger.info(
    "[gatling:{}] Initializing simulation profile={}, runLabel={}, baseUrl={}, resolvedModel={}",
    moduleName,
    profileName,
    runtimeTaggedLabel,
    baseUrl,
    modelName
  )

  protected def tagsPopulation(tagsScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder
  protected def generatePopulation(generateScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder

  private val httpProtocol = http
    .baseUrl(baseUrl)
    .acceptHeader("application/json")
    .contentTypeHeader("application/json")
    .shareConnections
    .warmUp(baseUrl + "/api/tags")

  private val tagsScenario = scenario(s"$modelTaggedLabel - tags")
    .exec(
      http(s"list models [model=$modelName]")
        .get("/api/tags")
        .check(status.is(200))
    )
    .pause(profile.requestPause.millis)

  private val generateScenario = scenario(s"$modelTaggedLabel - generate")
    .exec(
      http(s"generate prompt [model=$modelName]")
        .post("/api/generate")
        .body(
          StringBody(
            s"""{"model":"$modelName","prompt":"Explain the purpose of CI smoke testing in one concise paragraph.","stream":false}"""
          )
        )
        .asJson
        .check(status.in(200 to 299))
    )
    .pause(profile.thinkTime.millis)

  setUp(
    tagsPopulation(tagsScenario, profile),
    generatePopulation(generateScenario, profile)
  ).protocols(httpProtocol)
}
