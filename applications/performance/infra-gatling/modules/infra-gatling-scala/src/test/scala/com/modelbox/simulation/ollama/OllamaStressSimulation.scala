package com.modelbox.simulation.ollama

import com.modelbox.gatling.GatlingWorkloadProfile
import io.gatling.core.Predef._
import io.gatling.core.structure.{PopulationBuilder, ScenarioBuilder}
import scala.concurrent.duration._

class OllamaStressSimulation extends OllamaSimulationBase("stress", "ollama-stress") {
  override protected def tagsPopulation(tagsScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    tagsScenario.inject(rampUsers(profile.warmupUsers) during profile.rampDuration)
  }

  override protected def generatePopulation(generateScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    val firstStepRate = Math.max(1, profile.maxUsers / 2)
    val secondStepRate = Math.max(2, profile.maxUsers)

    generateScenario.inject(
      rampUsers(profile.maxUsers) during profile.rampDuration,
      constantUsersPerSec(firstStepRate.toDouble) during profile.holdDuration,
      constantUsersPerSec(secondStepRate.toDouble) during profile.holdDuration,
      nothingFor(5.seconds),
      atOnceUsers(profile.maxUsers)
    )
  }
}
