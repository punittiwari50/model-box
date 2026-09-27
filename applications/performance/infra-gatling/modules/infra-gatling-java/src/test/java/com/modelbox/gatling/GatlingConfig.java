package com.modelbox.gatling;

import com.modelbox.config.ConfigLoader;

import java.util.Map;

public final class GatlingConfig {
    public static final class Properties {
        public static final String WARM_UP_USERS = "gatling.warmupUsers";
        public static final String MAX_USERS = "gatling.maxUsers";
        public static final String RAMP_DURATION = "gatling.rampDuration";
        public static final String HOLD_DURATION = "gatling.holdDuration";
        public static final String THINK_TIME = "gatling.thinkTime";
        public static final String TIMEOUT = "gatling.timeout";
        public static final String REQUEST_PAUSE = "gatling.requestPause";

        private Properties() {
        }
    }

    public static final class Defaults {
        public static final int WARM_UP_USERS = 5;
        public static final int MAX_USERS = 20;
        public static final int RAMP_DURATION = 30;
        public static final int HOLD_DURATION = 300;
        public static final int THINK_TIME = 1000;
        public static final int TIMEOUT = 30;
        public static final int REQUEST_PAUSE = 500;

        private Defaults() {
        }
    }

    private static final int WARMUP_USERS = ConfigLoader.getInt(Properties.WARM_UP_USERS, Defaults.WARM_UP_USERS);
    private static final int MAX_USERS = ConfigLoader.getInt(Properties.MAX_USERS, Defaults.MAX_USERS);
    private static final int RAMP_DURATION = ConfigLoader.getInt(Properties.RAMP_DURATION, Defaults.RAMP_DURATION);
    private static final int HOLD_DURATION = ConfigLoader.getInt(Properties.HOLD_DURATION, Defaults.HOLD_DURATION);
    private static final int THINK_TIME = ConfigLoader.getInt(Properties.THINK_TIME, Defaults.THINK_TIME);
    private static final int REQUEST_PAUSE = ConfigLoader.getInt(Properties.REQUEST_PAUSE, Defaults.REQUEST_PAUSE);

    private static final GatlingWorkloadProfile LOAD_PROFILE = new GatlingWorkloadProfile(
            "load",
            readProfileInt("load", Properties.WARM_UP_USERS, WARMUP_USERS),
            readProfileInt("load", Properties.MAX_USERS, MAX_USERS),
            readProfileInt("load", Properties.RAMP_DURATION, RAMP_DURATION),
            readProfileInt("load", Properties.HOLD_DURATION, 120),
            readProfileInt("load", Properties.REQUEST_PAUSE, REQUEST_PAUSE),
            readProfileInt("load", Properties.THINK_TIME, THINK_TIME)
    );

    private static final GatlingWorkloadProfile STRESS_PROFILE = new GatlingWorkloadProfile(
            "stress",
            readProfileInt("stress", Properties.WARM_UP_USERS, WARMUP_USERS),
            readProfileInt("stress", Properties.MAX_USERS, MAX_USERS * 2),
            readProfileInt("stress", Properties.RAMP_DURATION, RAMP_DURATION * 2),
            readProfileInt("stress", Properties.HOLD_DURATION, 90),
            readProfileInt("stress", Properties.REQUEST_PAUSE, REQUEST_PAUSE),
            readProfileInt("stress", Properties.THINK_TIME, THINK_TIME)
    );

    private static final GatlingWorkloadProfile SOAK_PROFILE = new GatlingWorkloadProfile(
            "soak",
            readProfileInt("soak", Properties.WARM_UP_USERS, WARMUP_USERS),
            readProfileInt("soak", Properties.MAX_USERS, MAX_USERS),
            readProfileInt("soak", Properties.RAMP_DURATION, RAMP_DURATION),
            readProfileInt("soak", Properties.HOLD_DURATION, 1800),
            readProfileInt("soak", Properties.REQUEST_PAUSE, REQUEST_PAUSE),
            readProfileInt("soak", Properties.THINK_TIME, THINK_TIME)
    );

    private static final GatlingWorkloadProfile SPIKE_PROFILE = new GatlingWorkloadProfile(
            "spike",
            readProfileInt("spike", Properties.WARM_UP_USERS, WARMUP_USERS),
            readProfileInt("spike", Properties.MAX_USERS, MAX_USERS * 3),
            readProfileInt("spike", Properties.RAMP_DURATION, 10),
            readProfileInt("spike", Properties.HOLD_DURATION, 30),
            readProfileInt("spike", Properties.REQUEST_PAUSE, REQUEST_PAUSE),
            readProfileInt("spike", Properties.THINK_TIME, THINK_TIME)
    );

    private static final Map<String, GatlingWorkloadProfile> PROFILES = Map.of(
            "load", LOAD_PROFILE,
            "stress", STRESS_PROFILE,
            "soak", SOAK_PROFILE,
            "spike", SPIKE_PROFILE
    );

    private GatlingConfig() {
    }

    public static GatlingWorkloadProfile resolveProfile(String profileName) {
        String normalized = profileName == null ? "load" : profileName.trim().toLowerCase();
        if (normalized.isEmpty()) {
            normalized = "load";
        }
        return PROFILES.getOrDefault(normalized, LOAD_PROFILE);
    }

    private static int readProfileInt(String profileName, String key, int fallback) {
        String profileKey = "gatling.profile." + profileName + "." + key.replaceFirst("^gatling\\.", "");
        return ConfigLoader.getInt(profileKey, fallback);
    }
}