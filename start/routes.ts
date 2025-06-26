/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const AiChatsController = () => import('#controllers/ai_chats_controller')


router.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  }
})

router.get('/supported-models', [AiChatsController, 'supportedModels']);
router.post('/chat', [AiChatsController, 'chat']);
router.delete('/clear-chat', [AiChatsController, 'clearChatHistory']);
router.get('/chat-history', [AiChatsController, 'chatHistory']);
