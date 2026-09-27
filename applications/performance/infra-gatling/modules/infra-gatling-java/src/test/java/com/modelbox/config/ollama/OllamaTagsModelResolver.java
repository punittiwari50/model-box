package com.modelbox.config.ollama;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class OllamaTagsModelResolver {
    private static final Pattern MODEL_NAME_PATTERN = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");

    private final String baseUrl;
    private final HttpClient client;
    private final Duration requestTimeout;

    OllamaTagsModelResolver(String baseUrl) {
        this(baseUrl, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(), Duration.ofSeconds(20));
    }

    OllamaTagsModelResolver(String baseUrl, HttpClient client, Duration requestTimeout) {
        this.baseUrl = baseUrl;
        this.client = client;
        this.requestTimeout = requestTimeout;
    }

    String resolve(String modelHint) {
        String trimmedHint = modelHint == null ? "" : modelHint.trim();
        if (!trimmedHint.isEmpty() && !"auto".equalsIgnoreCase(trimmedHint)) {
            return trimmedHint;
        }
        return fetchFirstAvailableModel().orElseThrow(() -> new IllegalStateException(
                "No Ollama models are available at " + baseUrl + "/api/tags. Ensure at least one model is present in Ollama before running performance tests."
        ));
    }

    private Optional<String> fetchFirstAvailableModel() {
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/tags"))
                .timeout(requestTimeout)
                .GET()
                .build();

        HttpResponse<String> response = send(request);
        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException(
                    "Unable to read Ollama model list from " + baseUrl + "/api/tags (HTTP " + response.statusCode() + ")"
            );
        }

        return firstModelName(response.body());
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while querying " + baseUrl + "/api/tags", ex);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to query " + baseUrl + "/api/tags", ex);
        }
    }

    private static Optional<String> firstModelName(String body) {
        Matcher matcher = MODEL_NAME_PATTERN.matcher(body);
        if (matcher.find()) {
            return Optional.of(matcher.group(1));
        }
        return Optional.empty();
    }
}