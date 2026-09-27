package com.modelbox.config.ollama;

import com.modelbox.config.ConfigLoader;

public final class OllamaConfig {
    public static final class Properties {
        public static final String BASE_URL = "ollama.baseUrl";
        public static final String MODEL = "ollama.model";
        public static final String TIMEOUT = "ollama.timeout";
        public static final String RETRIES = "ollama.retries";

        private Properties() {
        }
    }

    public static final class Defaults {
        public static final String BASE_URL = "http://127.0.0.1:11435";
        public static final String MODEL = "auto";
        public static final int TIMEOUT = 60;
        public static final int RETRIES = 3;

        private Defaults() {
        }
    }

    private static final String BASE_URL_VALUE = ConfigLoader.getString(Properties.BASE_URL, Defaults.BASE_URL);
    private static final String CONFIGURED_MODEL_VALUE = ConfigLoader.getString(Properties.MODEL, Defaults.MODEL);
    private static final int TIMEOUT_VALUE = ConfigLoader.getInt(Properties.TIMEOUT, Defaults.TIMEOUT);
    private static final int RETRIES_VALUE = ConfigLoader.getInt(Properties.RETRIES, Defaults.RETRIES);
    private static volatile String resolvedModel;

    private OllamaConfig() {
    }

    public static String baseUrl() {
        return BASE_URL_VALUE;
    }

    public static String configuredModel() {
        return CONFIGURED_MODEL_VALUE;
    }

    public static String model() {
        String current = resolvedModel;
        if (current != null) {
            return current;
        }
        synchronized (OllamaConfig.class) {
            if (resolvedModel == null) {
                resolvedModel = new OllamaTagsModelResolver(baseUrl()).resolve(configuredModel());
            }
            return resolvedModel;
        }
    }

    public static int timeout() {
        return TIMEOUT_VALUE;
    }

    public static int retries() {
        return RETRIES_VALUE;
    }
}