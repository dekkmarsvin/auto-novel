package api

import api.plugins.authentication
import api.plugins.rateLimit
import appModule
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import infra.ElasticSearchClient
import infra.MongoClient
import infra.RedisClient
import io.kotest.assertions.withClue
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.resources.Resources
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import org.koin.dsl.module
import org.koin.ktor.plugin.Koin
import routeApplicationApi
import java.time.Instant

private const val RETIREMENT_TEST_SECRET = "isolated-route-retirement-test-secret"
private const val RETIRED_ID = "660ab4da55001f583649a621"

private fun retirementAdminToken(): String = JWT.create()
    .withSubject("isolated-route-retirement-admin")
    .withClaim("uid", 1L)
    .withClaim("role", "admin")
    .withClaim("crat", 1_700_000_000L)
    .withExpiresAt(Instant.now().plusSeconds(60))
    .sign(Algorithm.HMAC256(RETIREMENT_TEST_SECRET))

private fun Application.installApplicationRoutes(attemptedClients: MutableList<String>) {
    install(Koin) {
        modules(appModule, module {
            single<MongoClient> {
                attemptedClients.add("mongo")
                error("Route test must not connect to MongoDB")
            }
            single<ElasticSearchClient> {
                attemptedClients.add("elasticsearch")
                error("Route test must not connect to Elasticsearch")
            }
            single<RedisClient> {
                attemptedClients.add("redis")
                error("Route test must not connect to Redis")
            }
        })
    }
    authentication(RETIREMENT_TEST_SECRET)
    rateLimit()
    install(Resources)
    routing { routeApplicationApi() }
}

class ApiRouteRetirementTest : DescribeSpec({
    describe("the production API route wiring") {
        val retiredRoutes = listOf(
            HttpMethod.Get to "/article?page=0&pageSize=10&category=General",
            HttpMethod.Get to "/article/$RETIRED_ID",
            HttpMethod.Post to "/article",
            HttpMethod.Put to "/article/$RETIRED_ID",
            HttpMethod.Delete to "/article/$RETIRED_ID",
            HttpMethod.Put to "/article/$RETIRED_ID/locked",
            HttpMethod.Delete to "/article/$RETIRED_ID/locked",
            HttpMethod.Put to "/article/$RETIRED_ID/pinned",
            HttpMethod.Delete to "/article/$RETIRED_ID/pinned",
            HttpMethod.Put to "/article/$RETIRED_ID/hidden",
            HttpMethod.Delete to "/article/$RETIRED_ID/hidden",
            HttpMethod.Get to "/comment?site=web-syosetu-n1&page=0&pageSize=10",
            HttpMethod.Post to "/comment",
            HttpMethod.Delete to "/comment/$RETIRED_ID",
            HttpMethod.Put to "/comment/$RETIRED_ID/hidden",
            HttpMethod.Delete to "/comment/$RETIRED_ID/hidden",
        )

        listOf(false, true).forEach { asAdmin ->
            it("returns 404 for retired forum/comment routes for ${if (asAdmin) "a signed admin" else "an anonymous caller"}") {
                val attemptedClients = mutableListOf<String>()
                testApplication {
                    application { installApplicationRoutes(attemptedClients) }
                    val token = if (asAdmin) retirementAdminToken() else null

                    for ((method, url) in retiredRoutes) {
                        val response = client.request(url) {
                            this.method = method
                            token?.let { bearerAuth(it) }
                        }

                        withClue("$method $url") {
                            response.status shouldBe HttpStatusCode.NotFound
                        }
                    }
                    attemptedClients shouldBe emptyList()
                }
            }
        }

        listOf(
            HttpMethod.Post to "/theme-glossary",
            HttpMethod.Put to "/theme-glossary/$RETIRED_ID",
            HttpMethod.Delete to "/theme-glossary/$RETIRED_ID",
        ).forEach { (method, url) ->
            it("keeps $method $url registered and rejects anonymous writes") {
                val attemptedClients = mutableListOf<String>()
                testApplication {
                    application { installApplicationRoutes(attemptedClients) }

                    val response = client.request(url) { this.method = method }

                    response.status shouldBe HttpStatusCode.Unauthorized
                    response.headers[HttpHeaders.WWWAuthenticate] shouldBe "Bearer"
                    attemptedClients shouldBe emptyList()
                }
            }
        }
    }
})
