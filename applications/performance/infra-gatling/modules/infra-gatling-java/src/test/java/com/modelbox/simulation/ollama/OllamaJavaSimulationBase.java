package com.modelbox.simulation.ollama;

import com.modelbox.config.ollama.OllamaConfig;
import com.modelbox.gatling.GatlingConfig;
import com.modelbox.gatling.GatlingWorkloadProfile;
import io.gatling.javaapi.core.PopulationBuilder;
import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;
import static io.gatling.javaapi.core.CoreDsl.StringBody;

abstract class OllamaJavaSimulationBase extends Simulation {
        private static final Logger LOGGER = LogManager.getLogger(OllamaJavaSimulationBase.class);
    private static final String MODULE_NAME = "infra-gatling-java";
        private final String baseUrl = OllamaConfig.baseUrl();
        protected final GatlingWorkloadProfile profile;

    protected OllamaJavaSimulationBase(String profileName, String runLabel) {
        final String runtimeTaggedLabel = runLabel + "-java";
        this.profile = GatlingConfig.resolveProfile(profileName);
        String resolvedModelName = OllamaConfig.model();
        LOGGER.info("[gatling:{}] Initializing simulation profile={}, runLabel={}, baseUrl={}, resolvedModel={}", MODULE_NAME, profileName, runtimeTaggedLabel, baseUrl, resolvedModelName);
        warmupWithVirtualThreadClient();

        HttpProtocolBuilder httpProtocol = http
                .baseUrl(baseUrl)
                .acceptHeader("application/json")
                .contentTypeHeader("application/json")
                .shareConnections()
                .warmUp(baseUrl + "/api/tags");

        ScenarioBuilder tagsScenario = scenario(runtimeTaggedLabel + " - tags")
                .exec(
                        http("list models")
                                .get("/api/tags")
                                .check(status().is(200))
                )
                .pause(Duration.ofMillis(profile.requestPauseMillis()));

        ScenarioBuilder generateScenario = scenario(runtimeTaggedLabel + " - generate")
                .exec(
                        http("generate prompt")
                                .post("/api/generate")
                                .asJson()
                                .body(StringBody("{\"model\":\"" + resolvedModelName + "\",\"prompt\":\"Say hi in one short sentence.\",\"stream\":false,\"options\":{\"num_predict\":16}}"))
                                .check(status().in(200, 299))
                )
                .pause(Duration.ofMillis(profile.thinkTimeMillis()));

        setUp(
                tagsPopulation(tagsScenario),
                generatePopulation(generateScenario)
        ).protocols(httpProtocol);
    }

    protected abstract PopulationBuilder tagsPopulation(ScenarioBuilder tagsScenario);

    protected abstract PopulationBuilder generatePopulation(ScenarioBuilder generateScenario);

    private void warmupWithVirtualThreadClient() {
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            HttpClient client = HttpClient.newBuilder()
                    .executor(executor)
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/tags"))
                    .GET()
                    .timeout(Duration.ofSeconds(10))
                    .build();
            client.send(request, HttpResponse.BodyHandlers.discarding());
                } catch (Exception ex) {
                        LOGGER.warn("[gatling:{}] Warmup skipped: {}", MODULE_NAME, ex.getMessage());
        }
    }
}
