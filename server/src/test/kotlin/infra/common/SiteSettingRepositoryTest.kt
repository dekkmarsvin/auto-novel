package infra.common

import com.mongodb.MongoClientSettings
import com.mongodb.client.result.UpdateResult
import com.mongodb.kotlin.client.coroutine.MongoCollection
import infra.MongoClient
import infra.MongoCollectionNames
import io.mockk.*
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.assertions.throwables.shouldThrow
import org.bson.Document

class SiteSettingRepositoryTest : DescribeSpec({
    it("writes the setting key, value and upsert option for both new and empty passwords") {
        val mongo = mockk<MongoClient>()
        val collection = mockk<MongoCollection<SiteSetting>>()
        every { mongo.database.getCollection<SiteSetting>(MongoCollectionNames.SITE_SETTING) } returns collection
        coEvery { collection.replaceOne(any(), any<SiteSetting>(), any()) } returns UpdateResult.acknowledged(1, 1, null)
        val repo = SiteSettingRepository(mongo)
        listOf("mock-new", "").forEach { password ->
            repo.set(SiteSettingRepository.NAILAIN_PASSWORD, password)
            coVerify(exactly = 1) {
                collection.replaceOne(
                    match { it.toBsonDocument(Document::class.java, MongoClientSettings.getDefaultCodecRegistry()).getString("_id").value == "nailain-password" },
                    SiteSetting("nailain-password", password),
                    match { it.isUpsert },
                )
            }
        }
        coVerify(exactly = 2) { collection.replaceOne(any(), any<SiteSetting>(), any()) }
    }
    it("Mongo overrides env; missing or empty uses env; no credentials and DB errors stay explicit") {
        resolveNailainPassword({ "mock-db" }, { "mock-env" }) shouldBe "mock-db"
        resolveNailainPassword({ "" }, { "mock-env" }) shouldBe "mock-env"
        resolveNailainPassword({ null }, { "mock-env" }) shouldBe "mock-env"
        resolveNailainPassword({ "" }, { null }) shouldBe null
        shouldThrow<IllegalStateException> { resolveNailainPassword({ error("mock-db-unavailable") }, { "mock-env" }) }
    }
})
