const express = require('express');
const { requireAuth } = require('../middleware/auth');
const documentsController = require('../controllers/documents.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/categories', documentsController.listCategories);
router.post('/categories', documentsController.createCategory);

router.get('/', documentsController.listDocuments);
router.post('/', documentsController.upload.single('file'), documentsController.uploadDocument);
router.get('/:id/download', documentsController.downloadDocument);
router.delete('/:id', documentsController.deleteDocument);
router.post('/:id/acknowledge', documentsController.acknowledgeDocument);
router.get('/:id/acknowledgements', documentsController.listAcknowledgements);

module.exports = router;
