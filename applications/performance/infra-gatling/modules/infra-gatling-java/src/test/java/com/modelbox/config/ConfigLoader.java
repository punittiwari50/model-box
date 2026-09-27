package com.modelbox.config;

import com.modelbox.shared.RuntimeDefaults;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Generic configuration loader supporting both properties and YAML files.
 * Load order mirrors the Scala implementation.
 */
public final class ConfigLoader {
    private static final ConcurrentHashMap<String, String> CONFIG = new ConcurrentHashMap<>();
    private static final String PROFILE_ENV_VAR = RuntimeDefaults.APP_PROFILE_ENV_VAR;

    static {
        init();
    }

    private ConfigLoader() {
    }

    private static void init() {
        String profile = stripOption(System.getenv(PROFILE_ENV_VAR)).orElse(RuntimeDefaults.DEFAULT_PROFILE);

        CONFIG.putAll(loadYamlFile("application.yml"));
        CONFIG.putAll(loadPropertiesFile("application.properties"));

        CONFIG.putAll(loadYamlFile("application-" + profile + ".yml"));
        CONFIG.putAll(loadPropertiesFile("application-" + profile + ".properties"));

        Properties systemProps = System.getProperties();
        for (String key : systemProps.stringPropertyNames()) {
            CONFIG.put(key, systemProps.getProperty(key));
        }
    }

    private static Map<String, String> loadYamlFile(String filename) {
        try (InputStream is = ConfigLoader.class.getClassLoader().getResourceAsStream(filename)) {
            if (is == null) {
                return Map.of();
            }
            String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            return parseYaml(content);
        } catch (IOException ex) {
            return Map.of();
        }
    }

    private static Map<String, String> loadPropertiesFile(String filename) {
        try (InputStream is = ConfigLoader.class.getClassLoader().getResourceAsStream(filename)) {
            if (is == null) {
                return Map.of();
            }
            Properties props = new Properties();
            props.load(is);
            Map<String, String> result = new HashMap<>();
            for (String key : props.stringPropertyNames()) {
                result.put(key, props.getProperty(key));
            }
            return result;
        } catch (IOException ex) {
            return Map.of();
        }
    }

    private static Map<String, String> parseYaml(String content) {
        Map<String, String> result = new HashMap<>();
        String currentPrefix = "";

        for (String line : content.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }

            if (line.startsWith("  ")) {
                String[] keyValue = trimmed.split(":", 2);
                if (keyValue.length == 2) {
                    String key = currentPrefix + keyValue[0].trim();
                    String value = keyValue[1].trim();
                    result.put(key, value);
                }
            } else {
                String[] keyValue = trimmed.split(":", 2);
                if (keyValue.length >= 1) {
                    currentPrefix = keyValue[0].trim() + ".";
                }
            }
        }

        return result;
    }

    public static String getString(String key, String defaultValue) {
        return CONFIG.getOrDefault(key, defaultValue);
    }

    public static int getInt(String key, int defaultValue) {
        String value = CONFIG.get(key);
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    public static boolean getBoolean(String key, boolean defaultValue) {
        String value = CONFIG.get(key);
        if (value == null) {
            return defaultValue;
        }
        return Boolean.parseBoolean(value);
    }

    public static Map<String, String> getAll() {
        return Map.copyOf(CONFIG);
    }

    public static boolean contains(String key) {
        return CONFIG.containsKey(key);
    }

    public static String getActiveProfile() {
        return stripOption(System.getenv(PROFILE_ENV_VAR)).orElse(RuntimeDefaults.DEFAULT_PROFILE);
    }

    private static Optional<String> stripOption(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(trimmed);
    }
}