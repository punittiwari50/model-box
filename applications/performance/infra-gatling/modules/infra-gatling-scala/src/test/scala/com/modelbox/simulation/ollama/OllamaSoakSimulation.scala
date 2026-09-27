package com.modelbox.simulation.ollama

import com.modelbox.gatling.GatlingWorkloadProfile
import io.gatling.core.Predef._
import io.gatling.core.structure.{PopulationBuilder, ScenarioBuilder}

class OllamaSoakSimulation extends OllamaSimulationBase("soak", "ollama-soak") {
  override protected def tagsPopulation(tagsScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    tagsScenario.inject(rampUsers(profile.warmupUsers) during profile.rampDuration)
  }

  override protected def generatePopulation(generateScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    val sustainedRate = Math.max(1, profile.maxUsers / 2)
    generateScenario.inject(
      rampUsers(sustainedRate) during profile.rampDuration,
      constantUsersPerSec(sustainedRate.toDouble) during profile.holdDuration
    )
  }
}
