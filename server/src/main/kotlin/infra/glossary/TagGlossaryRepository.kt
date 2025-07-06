package infra.glossary

import com.mongodb.client.model.Filters.`in`
import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.Projections.include
import com.mongodb.client.model.Updates.combine
import com.mongodb.client.model.Updates.set
import infra.MongoClient
import infra.MongoCollectionNames
import infra.aggregate
import infra.field
import infra.fieldPath
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.toList
import org.bson.conversions.Bson
import org.bson.types.ObjectId

class TagGlossaryRepository(mongo: MongoClient) {
    private val col = mongo.database.getCollection<TagGlossary>(MongoCollectionNames.GLOSSARY)

    suspend fun list(tag: String?): List<TagGlossary> {
        return if (tag != null) {
            col.find(eq(TagGlossary::tag.field(), tag)).toList()
        } else {
            col.find().toList()
        }
    }

    suspend fun listByTags(tags: List<String>): List<TagGlossary> {
        if (tags.isEmpty()) return emptyList()
        return col.find(`in`(TagGlossary::tag.field(), tags)).toList()
    }

    suspend fun get(id: String): TagGlossary? {
        return col.find(eq(TagGlossary::id.field(), ObjectId(id))).firstOrNull()
    }

    suspend fun create(tag: String, glossary: Map<String, String>, adminOnly: Boolean): ObjectId {
        val id = ObjectId()
        col.insertOne(TagGlossary(id, tag, glossary, adminOnly))
        return id
    }

    suspend fun update(id: String, glossary: Map<String, String>, adminOnly: Boolean?) {
        val updates = mutableListOf<Bson>(set(TagGlossary::glossary.field(), glossary))
        if (adminOnly != null) updates.add(set(TagGlossary::adminOnly.field(), adminOnly))
        col.updateOne(eq(TagGlossary::id.field(), ObjectId(id)), combine(updates))
    }

    suspend fun delete(id: String) {
        col.deleteOne(eq(TagGlossary::id.field(), ObjectId(id)))
    }
}
