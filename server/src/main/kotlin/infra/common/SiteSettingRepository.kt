package infra.common

import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.ReplaceOptions
import infra.MongoClient
import infra.MongoCollectionNames
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SiteSetting(
    @SerialName("_id") val key: String,
    val value: String,
)

// 可在界面上修改的站点设置，按 key 存取
class SiteSettingRepository(
    mongo: MongoClient,
) {
    private val collection =
        mongo.database.getCollection<SiteSetting>(
            MongoCollectionNames.SITE_SETTING,
        )

    suspend fun get(key: String): String? =
        collection.find(eq("_id", key)).firstOrNull()?.value

    suspend fun set(key: String, value: String) {
        collection.replaceOne(
            eq("_id", key),
            SiteSetting(key, value),
            ReplaceOptions().upsert(true),
        )
    }

    companion object {
        const val NAILAIN_PASSWORD = "nailain-password"
    }
}
