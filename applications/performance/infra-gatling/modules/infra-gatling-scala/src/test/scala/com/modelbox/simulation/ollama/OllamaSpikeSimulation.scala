package com.modelbox.simulation.ollama

import com.modelbox.gatling.GatlingWorkloadProfile
import io.gatling.core.Predef._
import io.gatling.core.structure.{PopulationBuilder, ScenarioBuilder}
import scala.concurrent.duration._

class OllamaSpikeSimulation extends OllamaSimulationBase("spike", "ollama-spike") {
  override protected def tagsPopulation(tagsScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    tagsScenario.inject(rampUsers(profile.warmupUsers) during profile.rampDuration)
  }

  override protected def generatePopulation(generateScenario: ScenarioBuilder, profile: GatlingWorkloadProfile): PopulationBuilder = {
    val baseline = Math.max(1, profile.maxUsers / 4)
    generateScenario.inject(
      constantUsersPerSec(baseline.toDouble) during profile.holdDuration,
      nothingFor(3.seconds),
      atOnceUsers(profile.maxUsers),
      nothingFor(3.seconds),
      atOnceUsers(profile.maxUsers)
    )
  }
}
