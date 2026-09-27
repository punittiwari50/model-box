package com.modelbox.simulation.ollama;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class JavaGatlingConfig {
    private static final Pattern MODEL_NAME_PATTERN = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");

    private JavaGatlingConfig() {
    }

    static String baseUrl() {
        return str("ollama.baseUrl", "OLLAMA_BASE_URL", "http://ollama-model-service:11434");
    }

    static String modelName() {
        return str("ollama.model", "OLLAMA_MODEL", "auto");
    }

    static String resolveModelName(String configuredModel, String baseUrl) {
        String trimmed = configuredModel == null ? "" : configuredModel.trim();
        if (trimmed.isEmpty() || "auto".equalsIgnoreCase(trimmed)) {
            return fetchFirstAvailableModel(baseUrl).orElseThrow(() -> new IllegalStateException(
                    "No Ollama models are available at " + baseUrl + "/api/tags. Ensure at least one model is present in Ollama before running performance tests."
            ));
        }
        return trimmed;
    }

    private static Optional<String> fetchFirstAvailableModel(String baseUrl) {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/tags"))
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build();

        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException(
                        "Unable to read Ollama model list from " + baseUrl + "/api/tags (HTTP " + response.statusCode() + ")"
                );
            }

            return firstModelName(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while querying " + baseUrl + "/api/tags", e);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to query " + baseUrl + "/api/tags", e);
        }
    }

    private static Optional<String> firstModelName(String body) {
        Matcher matcher = MODEL_NAME_PATTERN.matcher(body);
        if (matcher.find()) {
            return Optional.of(matcher.group(1));
        }
        return Optional.empty();
    }

    static JavaGatlingProfile profileFor(String name) {
        int warmup = intWithProfile(name, "warmupUsers", intVal("gatling.warmupUsers", "GATLING_WARMUP_USERS", 5));
        int max = intWithProfile(name, "maxUsers", intVal("gatling.maxUsers", "GATLING_MAX_USERS", 20));
        int ramp = intWithProfile(name, "rampDuration", defaultRamp(name));
        int hold = intWithProfile(name, "holdDuration", defaultHold(name));
        int pause = intWithProfile(name, "requestPause", 500);
        int think = intWithProfile(name, "thinkTime", 1000);
        return new JavaGatlingProfile(warmup, max, ramp, hold, pause, think);
    }

    private static int defaultRamp(String profile) {
        return switch (profile) {
            case "stress" -> 60;
            case "soak" -> 45;
            case "spike" -> 10;
            default -> 30;
        };
    }

    private static int defaultHold(String profile) {
        return switch (profile) {
            case "stress" -> 90;
            case "soak" -> 1800;
            case "spike" -> 20;
            default -> 120;
        };
    }

    private static int intWithProfile(String profile, String key, int fallback) {
        String prop = "gatling.profile." + profile + "." + key;
        String raw = System.getProperty(prop);
        if (raw != null && !raw.isBlank()) {
            try {
                return Integer.parseInt(raw.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    private static int intVal(String sysProp, String env, int fallback) {
        String sys = System.getProperty(sysProp);
        if (sys != null && !sys.isBlank()) {
            try {
                return Integer.parseInt(sys.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        String envVal = System.getenv(env);
        if (envVal != null && !envVal.isBlank()) {
            try {
                return Integer.parseInt(envVal.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    private static String str(String sysProp, String env, String fallback) {
        String sys = System.getProperty(sysProp);
        if (sys != null && !sys.isBlank()) {
            return sys;
        }
        String envVal = System.getenv(env);
        if (envVal != null && !envVal.isBlank()) {
            return envVal;
        }
        return fallback;
    }
}
