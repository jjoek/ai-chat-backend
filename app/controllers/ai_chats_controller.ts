import type { HttpContext } from '@adonisjs/core/http'
import { Ollama } from 'ollama'
import config from '@adonisjs/core/services/config'
import { supportedModels } from '#config/jjoek'; // TODO: rely on the service container to pull the config, to avoid loading it on class initialization
import logger from '@adonisjs/core/services/logger'

let chatHistory = [];

type ChatResponse = {
  role: string;
  content: string;
};


export default class AiChatsController {
  public async chat({ response, request }: HttpContext) {
    const { userMessage, modelId } = this.validateData(request.body());

    const startedAt = Date.now();

    logger.info(`Started processing request at ${this.formatTimestamp(startedAt)}`);
    const res = await this.sendToModelForProcessing(modelId, userMessage);

    return response.json({
      message: 'User query response',
      success: true,
      modelRes: res,
      chatHistory,
      times: {
        startTime: this.formatTimestamp(startedAt),
        endTime: this.formatTimestamp(Date.now()),
        diffInSeconds: `${(Date.now() - startedAt) / 1000} seconds`
      }
    })
  }

  public clearChatHistory({ response }: HttpContext)
  {
    chatHistory = [];

    return response.json({
      success: true,
      message: 'Chat history cleared successfully'
    })
  }

  public async supportedModels({ response }: HttpContext) {
    const models = config.get('jjoek.supportedModels');

    return response.json({
      success: true,
      message: 'List of supported models',
      models,
      selectedModel: models.find((m) => m.id === 'deepseek-r1:1.5b') || models[0],
    })
  }

  public chatHistory({response} : HttpContext) {
    return response.json({
      success: true,
      message: 'Chat History',
      chats: chatHistory
    })
  }

  private validateData(requestData: any)
  {
    const userMessage = requestData.message;
    const modelId = requestData.modelId; // validate that this a supported model and probably the user has access to it

    if(!userMessage.trim()) throw new Error('Invalid text prompt');

    if(!supportedModels.find((model) =>  model.id === modelId)) throw new Error(`${modelId} model is not supported`);

    return {userMessage, modelId};
  }

  private async sendToModelForProcessing(modelId: string, userMessage: string) : Promise<ChatResponse>
  {
    const ollama = new Ollama({
      // host: 'ollama:11434'
      host: 'http://host.docker.internal:11434'
    })

    const res = await ollama.chat({
      model: modelId,
      messages: [
        {role: 'system', content: "My name is JJoek AI, an an artificial intelligence assistant created by JJoek."},
        ...chatHistory,
        { role: 'user', content: userMessage }
      ],
    })

    logger.info("Data fetched successfully");
    logger.info(JSON.stringify(res, null, 2));

    const parsedRes = this.parseResponse(modelId, res);
    this.updateHistory(modelId, userMessage, parsedRes)

    return parsedRes;
  }

  /**
   * TODO: fix the chat history ids below
   * @param userMessage
   * @param parsedRes
   */
  private updateHistory(modelId, userMessage: string, parsedRes: ChatResponse)
  {
    const model = supportedModels.find((m) => m.id ===  modelId);

    chatHistory.push({
      id: Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      modelId,
      modelName: model?.name
    });

    chatHistory.push({
      ...parsedRes,
      id: Date.now()+1,
      timestamp: new Date(),
      modelId,
      modelName: model?.name
    });
  }

  private parseResponse(modelId: string, res: any) : ChatResponse
  {
    return {
      role: res.message.role,
      content: res.message.content.replace(/<think>.*?<\/think>\n\n/gs, '')
    }
  }

  private formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

