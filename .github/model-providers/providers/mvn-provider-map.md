# Maven Provider Mapping

Canonical provider mapping for Maven execution variants used in CI.

| Provider ID | Java version | POM file | Example command |
|---|---|---|---|
| default-jdk27 | 27 | <POM_FILE_DEFAULT> | mvn -B -ntp -f <POM_FILE_DEFAULT> verify |
| suffix-jdk21 | 21 | <POM_FILE_JDK21> | mvn -B -ntp -f <POM_FILE_JDK21> verify |

Notes:
- Default Maven configuration targets JDK27 through pom.xml.
- JDK21 compatibility is available through the suffixed pom-jdk21.xml profile.
