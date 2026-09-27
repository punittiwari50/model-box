package com.modelbox.simulation.ollama

import com.modelbox.config.ollama.OllamaConfig
import com.modelbox.gatling.{GatlingConfig, GatlingWorkloadProfile}
import io.gatling.core.Predef._
import io.gatling.http.Predef._
import io.gatling.core.structure.{PopulationBuilder, ScenarioBuilder}
import scala.concurrent.duration._

abstract class OllamaSimulationBase(profileName: String, runLabel: String) extends Simulation {

  private val runtimeTaggedLabel = s"$runLabel-scala"

  private val baseUrl = OllamaConfig.baseUrl
  private val modelName = OllamaConfig.model
  protected val profile: GatlingWorkloadProfile = GatlingConfig.resolveProfile(profileName)

  protected def tagsPopulation(tagsScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder
  protected def generatePopulation(generateScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder

  private val httpProtocol = http
    .baseUrl(baseUrl)
    .acceptHeader("application/json")
    .contentTypeHeader("application/json")
    .shareConnections
    .warmUp(baseUrl + "/api/tags")

  private val tagsScenario = scenario(s"$runtimeTaggedLabel - tags")
    .exec(
      http("list models")
        .get("/api/tags")
        .check(status.is(200))
    )
    .pause(profile.requestPause.millis)

  private val generateScenario = scenario(s"$runtimeTaggedLabel - generate")
    .exec(
      http("generate prompt")
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
