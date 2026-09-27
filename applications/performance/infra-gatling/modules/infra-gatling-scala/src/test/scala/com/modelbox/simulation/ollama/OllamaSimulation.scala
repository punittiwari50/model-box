package com.modelbox.simulation.ollama

import io.gatling.core.Predef._
import com.modelbox.gatling.GatlingWorkloadProfile
import io.gatling.core.structure.{PopulationBuilder, ScenarioBuilder}

class OllamaSimulation extends OllamaLoadSimulation

class OllamaLoadSimulation extends OllamaSimulationBase("load", "ollama-load") {
  override protected def tagsPopulation(tagsScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    tagsScenario.inject(rampUsers(profile.warmupUsers) during profile.rampDuration)
  }

  override protected def generatePopulation(generateScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    generateScenario.inject(
      rampUsers(profile.maxUsers) during profile.rampDuration,
      constantUsersPerSec(profile.maxUsers.toDouble) during profile.holdDuration
    )
  }
}
