/**
 * Soft-delete archive: copy a document into `deleted_records` before removing
 * it from its live collection. Used by Data Management delete flows.
 */
async function archiveAndDelete(db, { collection, id, deletedBy, dataType }) {
  if (!db) throw new Error('Database not available');
  if (!collection || !id) throw new Error('collection and id are required');

  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error(`${collection} record not found`);
    err.status = 404;
    throw err;
  }

  const original = snap.data() || {};
  const archive = {
    originalCollection: collection,
    originalId: id,
    dataType: dataType || collection,
    data: original,
    deletedBy: deletedBy || 'unknown',
    deletedAt: new Date().toISOString(),
  };

  // Avoid nested-array issues if coordinates already stringified; store as-is.
  await db.collection('deleted_records').add(archive);
  await ref.delete();

  return { success: true, archived: true, originalId: id, dataType: archive.dataType };
}

module.exports = { archiveAndDelete };
