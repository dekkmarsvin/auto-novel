package infra.glossary

import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.bson.types.ObjectId

@Serializable
data class TagGlossary(
    @Contextual @SerialName("_id") val id: ObjectId,
    val tag: String,
    val glossary: Map<String, String>,
    val adminOnly: Boolean = false,
)
