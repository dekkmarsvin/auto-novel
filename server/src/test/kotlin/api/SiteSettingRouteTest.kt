package api

import api.plugins.authentication
import api.plugins.contentNegotiation
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import infra.common.SiteSettingRepository
import infra.user.UserRepository
import io.mockk.*
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.resources.Resources
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import org.koin.dsl.module
import org.koin.ktor.plugin.Koin
import java.time.Instant

class SiteSettingRouteTest : DescribeSpec({
    listOf(null, "member", "trusted", "restricted", "admin").forEach { role ->
        it("GET and PUT enforce database-authenticated ${role ?: "anonymous"} access") {
            val repo = mockk<SiteSettingRepository>()
            val users = mockk<UserRepository>()
            coEvery { users.getId(any()) } returns "mock-id"
            coEvery { repo.get(any()) } returns "mock-value"
            coEvery { repo.set(any(), any()) } just Runs
            testApplication {
                application {
                    authentication("isolated-setting-test")
                    contentNegotiation()
                    install(Resources)
                    install(Koin) { modules(module { single { repo }; single { users } }) }
                    routing { routeSiteSetting() }
                }
                val jwt = JWT.create().withSubject("mock-admin").withClaim("role", role)
                    .withClaim("crat", 1700000000L).withExpiresAt(Instant.now().plusSeconds(60))
                    .sign(Algorithm.HMAC256("isolated-setting-test"))
                val get = client.get("/site-setting/nailain-password") { if (role != null) bearerAuth(jwt) }
                val put = client.put("/site-setting/nailain-password") {
                    if (role != null) bearerAuth(jwt)
                    contentType(ContentType.Application.Json)
                    setBody("""{"password":"  mock-new  "}""")
                }
                get.status shouldBe if (role == "admin") HttpStatusCode.OK else HttpStatusCode.Unauthorized
                put.status shouldBe get.status
                if (role == "admin") {
                    get.headers[HttpHeaders.CacheControl] shouldBe "no-store"
                    put.headers[HttpHeaders.CacheControl] shouldBe "no-store"
                    get.bodyAsText() shouldBe """{"password":"mock-value"}"""
                    coVerify(exactly = 1) { repo.set(SiteSettingRepository.NAILAIN_PASSWORD, "mock-new") }
                    val empty = client.put("/site-setting/nailain-password") {
                        bearerAuth(jwt); contentType(ContentType.Application.Json); setBody("""{"password":""}""")
                    }
                    empty.status shouldBe HttpStatusCode.OK
                    coVerify { repo.set(SiteSettingRepository.NAILAIN_PASSWORD, "") }
                    coEvery { repo.set(any(), any()) } throws IllegalStateException("mock-private-command")
                    val failed = client.put("/site-setting/nailain-password") {
                        bearerAuth(jwt); contentType(ContentType.Application.Json); setBody("""{"password":"mock-secret"}""")
                    }
                    failed.status shouldBe HttpStatusCode.InternalServerError
                    failed.headers[HttpHeaders.CacheControl] shouldBe "no-store"
                    failed.bodyAsText() shouldBe "站点设置操作失败"
                } else {
                    coVerify(exactly = 0) { repo.get(any()); repo.set(any(), any()) }
                }
            }
        }
    }
})
