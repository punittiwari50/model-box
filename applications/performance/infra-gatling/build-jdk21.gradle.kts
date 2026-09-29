import io.gatling.gradle.GatlingExtension

plugins {
    java
    scala
    id("io.gatling.gradle")
    id("org.owasp.dependencycheck")
    id("org.sonarqube")
}

group = "com.modelbox"
version = "1.0.0"

val javaToolchainVersionCompat = providers.gradleProperty("javaToolchainVersionCompat").get().toInt()
val gatlingVersion = providers.gradleProperty("gatlingVersion").get()
val scalaVersion = providers.gradleProperty("scalaVersion").get()
val log4j2Version = providers.gradleProperty("log4j2Version").get()

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(javaToolchainVersionCompat))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("io.gatling:gatling-core:$gatlingVersion")
    testImplementation("io.gatling:gatling-http:$gatlingVersion")
    testImplementation("org.scala-lang:scala3-library_3:$scalaVersion")

    testImplementation("org.apache.logging.log4j:log4j-api:$log4j2Version")
    testImplementation("org.apache.logging.log4j:log4j-core:$log4j2Version")
    testImplementation("org.apache.logging.log4j:log4j-slf4j2-impl:$log4j2Version")
}

configurations.configureEach {
    exclude(group = "ch.qos.logback")
}

dependencyCheck {
    failBuildOnCVSS = 0.0f
    formats = listOf("HTML", "JSON")
}

sonarqube {
    properties {
        property("sonar.projectKey", "model-box_infra-gatling-jdk21")
        property("sonar.projectName", "infra-gatling-jdk21")
        property("sonar.sourceEncoding", "UTF-8")
        property("sonar.sources", "modules/infra-gatling-java/src/test/java,modules/infra-gatling-scala/src/test/scala")
        property("sonar.tests", "modules/infra-gatling-java/src/test/java,modules/infra-gatling-scala/src/test/scala")
    }
}

val selectedSimulations = sequenceOf(
    System.getenv("GATLING_SIMULATIONS"),
    System.getenv("GATLING_SIMULATION")
).firstOrNull { !it.isNullOrBlank() }
    ?.split(',')
    ?.map { it.trim() }
    ?.filter { it.isNotEmpty() }
    ?: listOf("com.modelbox.simulation.ollama.OllamaLoadSimulation")

configure<GatlingExtension> {
    simulations = selectedSimulations
}

tasks.matching { it.name.startsWith("gatling", ignoreCase = true) }.configureEach {
    doFirst {
        val modelHint = sequenceOf(
            System.getProperty("ollama.model"),
            System.getenv("OLLAMA_MODEL")
        ).firstOrNull { !it.isNullOrBlank() } ?: "auto"
        val profile = System.getenv("APP_PROFILE") ?: "local"
        logger.lifecycle("[gatling:gradle-jdk21] runtime=gradle profile={} modelHint={} simulations={}", profile, modelHint, selectedSimulations.joinToString(","))
    }
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()

    val profile = System.getenv("APP_PROFILE") ?: "local"
    environment("APP_PROFILE", profile)

    systemProperties(System.getProperties() as Map<String, Any>)
}

sourceSets {
    test {
        scala {
            srcDir("modules/infra-gatling-scala/src/test/scala")
        }
        resources {
            srcDir("modules/infra-gatling-scala/src/test/resources")
        }
    }
}
