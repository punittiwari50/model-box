pluginManagement {
	val gatlingPluginVersion = providers.gradleProperty("gatlingPluginVersion").get()
	val owaspPluginVersion = providers.gradleProperty("owaspDependencyCheckPluginVersion").get()
	val sonarqubePluginVersion = providers.gradleProperty("sonarqubePluginVersion").get()

	plugins {
		id("io.gatling.gradle") version gatlingPluginVersion
		id("org.owasp.dependencycheck") version owaspPluginVersion
		id("org.sonarqube") version sonarqubePluginVersion
	}
}

rootProject.name = "infra-gatling"
