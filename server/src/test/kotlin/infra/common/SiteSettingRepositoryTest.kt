package infra.common

import com.mongodb.client.model.ReplaceOptions
import com.mongodb.client.result.UpdateResult
import com.mongodb.kotlin.client.coroutine.MongoCollection
import com.mongodb.kotlin.client.coroutine.FindFlow
import infra.MongoClient
import infra.MongoCollectionNames
import io.mockk.*
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.assertions.throwables.shouldThrowAny
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.FlowCollector

class SiteSettingRepositoryTest : DescribeSpec({
    it("uses the isolated Mongo collection and upserts the same key, including empty values") {
        val mongo = mockk<MongoClient>()
        val collection = mockk<MongoCollection<SiteSetting>>()
        every { mongo.database.getCollection<SiteSetting>(MongoCollectionNames.SITE_SETTING) } returns collection
        val find = mockk<FindFlow<SiteSetting>>()
        val filter = slot<org.bson.conversions.Bson>()
        every<FindFlow<SiteSetting>> { collection.find(capture(filter)) } returns find
        var stored: SiteSetting? = SiteSetting("nailain-password", "mock-stored")
        coEvery { find.collect(any<FlowCollector<SiteSetting>>()) } coAnswers { (stored?.let { flowOf(it) } ?: emptyFlow()).collect(firstArg<FlowCollector<SiteSetting>>()) }
        val options = slot<ReplaceOptions>()
        coEvery { collection.replaceOne(capture(filter), any<SiteSetting>(), capture(options)) } returns UpdateResult.acknowledged(1, 1, null)
        val repo = SiteSettingRepository(mongo)
        repo.get(SiteSettingRepository.NAILAIN_PASSWORD) shouldBe "mock-stored"
        filter.captured.toBsonDocument(org.bson.Document::class.java, com.mongodb.MongoClientSettings.getDefaultCodecRegistry()).getString("_id").value shouldBe "nailain-password"
        stored = null
        repo.get(SiteSettingRepository.NAILAIN_PASSWORD) shouldBe null
        repo.set(SiteSettingRepository.NAILAIN_PASSWORD, "mock-new")
        repo.set(SiteSettingRepository.NAILAIN_PASSWORD, "")
        options.captured.isUpsert shouldBe true
        filter.captured.toBsonDocument(org.bson.Document::class.java, com.mongodb.MongoClientSettings.getDefaultCodecRegistry()).getString("_id").value shouldBe "nailain-password"
        coVerify { collection.replaceOne(any(), SiteSetting("nailain-password", ""), any()) }
    }
    it("Mongo overrides env; missing or empty uses env; no credentials and DB errors stay explicit") {
        resolveNailainPassword({ "mock-db" }, { "mock-env" }) shouldBe "mock-db"
        resolveNailainPassword({ "" }, { "mock-env" }) shouldBe "mock-env"
        resolveNailainPassword({ null }, { "mock-env" }) shouldBe "mock-env"
        resolveNailainPassword({ "" }, { null }) shouldBe null
        shouldThrowAny { resolveNailainPassword({ error("mock-db-unavailable") }, { "mock-env" }) }
    }
})
