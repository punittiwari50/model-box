package com.modelbox.gatling;

public record GatlingWorkloadProfile(
        String name,
        int warmupUsers,
        int maxUsers,
        int rampDurationSeconds,
        int holdDurationSeconds,
        int requestPauseMillis,
        int thinkTimeMillis
) {
}