package com.modelbox.simulation.ollama;

import io.gatling.javaapi.core.PopulationBuilder;
import io.gatling.javaapi.core.ScenarioBuilder;

import java.time.Duration;

import static io.gatling.javaapi.core.CoreDsl.constantUsersPerSec;
import static io.gatling.javaapi.core.CoreDsl.rampUsers;

public class OllamaJavaSoakSimulation extends OllamaJavaSimulationBase {
    public OllamaJavaSoakSimulation() {
        super("soak", "ollama-soak");
    }

    @Override
    protected PopulationBuilder tagsPopulation(ScenarioBuilder tagsScenario) {
        return tagsScenario.injectOpen(rampUsers(profile.warmupUsers()).during(Duration.ofSeconds(profile.rampDurationSeconds())));
    }

    @Override
    protected PopulationBuilder generatePopulation(ScenarioBuilder generateScenario) {
        return generateScenario.injectOpen(
                rampUsers(profile.maxUsers()).during(Duration.ofSeconds(profile.rampDurationSeconds())),
                constantUsersPerSec(profile.maxUsers()).during(Duration.ofSeconds(profile.holdDurationSeconds()))
        );
    }
}
