package infra.common

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

@Serializable
data class ThemeGlossary(
    @Contextual @SerialName("_id") val id: ObjectId = ObjectId(),
    val name: String,
    @Contextual val authorId: ObjectId,
    val glossary: Map<String, String> = emptyMap(),
    @Contextual val createAt: Instant = Clock.System.now(),
    @Contextual val updateAt: Instant = Clock.System.now(),
)
