const { ServiceBroker } = require('moleculer')
const ClientService = require('../../src/client')

describe('Faktory client init', () => {
  it('should init worker', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      name: 'test',
      mixins: [ClientService],
      settings: {
        faktory: {
          url: 'tcp://:password@server:7419',
        }
      }
    })
    expect(service).toBeDefined()
    expect(service.$client).toBeDefined()
    expect(service.$client.connectionFactory.host).toBe('server')
    expect(service.$client.connectionFactory.port).toBe('7419')
    expect(service.$client.password).toBe('password')
    service.$client.connect = jest.fn()
    service.$client.close = jest.fn()
    await broker.start()
    expect(service.$client.connect).toHaveBeenCalled()
    await broker.stop()
    expect(service.$client.close).toHaveBeenCalled()
  })
})

describe('Faktory client methods', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    name: 'test',
    mixins: [ClientService]
  })
  service.$client.connect = jest.fn()
  service.$client.close = jest.fn()

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should queue job', async () => {
    service.$client.push = jest.fn()
    await service.queue({ meta: { user: {} } }, 'test', { test: 42 }, { start: { handler: 'test' } })
    expect(service.$client.push).toHaveBeenCalledWith({
      args: [{ test: 42 }, { hooks: { start: { handler: 'test' } }, meta: { user: {} } }],
      jobtype: 'test'
    })
  })
})
