package com.modelbox.simulation.ollama;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JavaGatlingConfigTest {

    @Test
    void resolvesExplicitModelNameWithoutLookup() {
        assertEquals("qwen3:8b", JavaGatlingConfig.resolveModelName("qwen3:8b", "http://localhost:11434"));
    }

    @Test
    void resolvesAutoToFirstAvailableModelFromOllamaTags() {
        assertEquals("qwen3:8b", JavaGatlingConfig.resolveModelName("auto", "http://localhost:11435"));
    }
}