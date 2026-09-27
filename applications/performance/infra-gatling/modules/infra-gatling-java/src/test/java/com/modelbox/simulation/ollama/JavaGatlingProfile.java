package com.modelbox.simulation.ollama;

final class JavaGatlingProfile {
    final int warmupUsers;
    final int maxUsers;
    final int rampDurationSeconds;
    final int holdDurationSeconds;
    final int requestPauseMillis;
    final int thinkTimeMillis;

    JavaGatlingProfile(int warmupUsers, int maxUsers, int rampDurationSeconds, int holdDurationSeconds, int requestPauseMillis, int thinkTimeMillis) {
        this.warmupUsers = warmupUsers;
        this.maxUsers = maxUsers;
        this.rampDurationSeconds = rampDurationSeconds;
        this.holdDurationSeconds = holdDurationSeconds;
        this.requestPauseMillis = requestPauseMillis;
        this.thinkTimeMillis = thinkTimeMillis;
    }
}
