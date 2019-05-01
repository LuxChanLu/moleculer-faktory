const { ServiceBroker } = require('moleculer')
const WorkerService = require('../../src/worker')

describe('Faktory worker init', () => {
  it('should init worker', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [WorkerService],
      settings: {
        faktory: {
          url: 'tcp://:password@server:7419',
        }
      },
      jobs: {
        'test.job'() {},
        'test.job.action': 'faktory.do'
      },
      actions: {
        'do'() { }
      }
    })
    expect(service).toBeDefined()
    expect(service.$worker).toBeDefined()
    expect(service.$worker.client.connectionFactory.host).toBe('server')
    expect(service.$worker.client.connectionFactory.port).toBe('7419')
    expect(service.$worker.client.password).toBe('password')
    expect(service.$worker.registry['test.job']).toBeDefined()
    expect(service.$worker.registry['test.job.action']).toBeDefined()
  })

  it('should init worker without hooks middleware', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [WorkerService],
      settings: {
        faktory: {
          url: 'tcp://:password@server:7419',
          hooks: false
        }
      }
    })
    expect(service).toBeDefined()
    expect(service.$worker).toBeDefined()
    expect(service.$worker.middleware[1]).toBeUndefined() // Hooks middleware
  })

  it('should init worker with user middlewares', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [WorkerService],
      settings: {
        faktory: {
          url: 'tcp://:password@server:7419',
          middlewares: [async (_, next) => next()]
        }
      }
    })
    expect(service).toBeDefined()
    expect(service.$worker).toBeDefined()
    expect(service.$worker.middleware[2]).toBeDefined() // Logs + Hooks + User middlware
  })
})

describe('Faktory worker job handler', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    mixins: [WorkerService],
    jobs: {
      'test.job.action': 'faktory.do'
    },
    actions: {
      'do'() { }
    }
  })
  service.$worker.work = jest.fn()
  service.$worker.stop = jest.fn()

  broker.call = jest.fn()

  beforeAll(() => broker.start())
  beforeAll(() => broker.stop())

  it('should call handler with action (And meta passed in args)', async () => {
    const data = { job: { args: [42, { meta: { test: true } }] } }
    await service.$worker.registry['test.job.action'](data)
    expect(broker.call).toHaveBeenCalledWith('faktory.do', data, { meta: { test: true } })
    delete data.job.args
    await service.$worker.registry['test.job.action'](data)
    expect(broker.call).toHaveBeenCalledWith('faktory.do', data, { meta: undefined })
  })
})

describe('Faktory worker lifecycle actions', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    mixins: [WorkerService],
    actions: {
      'hooks.test.start'() {},
      'hooks.test.end'() {}
    }
  })
  service.$worker.work = jest.fn()
  service.$worker.stop = jest.fn()

  beforeAll(() => broker.start())
  beforeAll(() => broker.stop())

  it('should quiet worker', async () => {
    await expect(broker.call('faktory.is.quiet')).resolves.toBeFalsy()
    await broker.call('faktory.quiet')
    await expect(broker.call('faktory.is.quiet')).resolves.toBeTruthy()
  })

  it('should stop worker', async () => {
    await broker.call('faktory.stop')
    expect(service.$worker.stop).toHaveBeenCalled()
  })

  it('should start worker', async () => {
    await broker.call('faktory.start')
    expect(service.$worker.work).toHaveBeenCalled()
  })

  it('should get worker jobs', async () => {
    await expect(broker.call('faktory.jobs')).resolves.toEqual([])
  })

  it('should run logger middleware', async () => {
    const next = jest.fn()
    service.logger.debug = jest.fn()
    await service.$worker.middleware[0]({ job: {} }, next)
    expect(service.logger.debug).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalled()
    service.logger.debug.mockRestore()
  })

  describe('Hooks', () => {
    it('should call start hooks', async () => {
      const next = jest.fn()
      const job = {
        jobtype: 'job.test',
        args: [
          42,
          {
            start: { handler: 'faktory.hooks.test.start', params: { test: true } }
          }
        ]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn()
      await service.$worker.middleware[1]({ job }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.start', job)
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.start', { job, test: true }, undefined)
    })

    it('should call end hooks', async () => {
      const next = jest.fn()
      const job = {
        jobtype: 'job.test',
        args: [
          42,
          { end: { handler: 'faktory.hooks.test.end' } }
        ]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn()
      await service.$worker.middleware[1]({ job }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.end', job)
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.end', { job }, undefined)
    })

    it('should call start hooks and block job', async () => {
      const next = jest.fn()
      const job = {
        jobtype: 'job.test',
        args: [
          42,
          {
            start: { handler: 'faktory.hooks.test.start', params: { test: true }, meta: { zero: 'two' } }
          }
        ]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn(() => false)
      await service.$worker.middleware[1]({ job }, next)
      expect(next).not.toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.start', job)
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.start', { job, test: true }, { meta: { zero: 'two' } })
      expect(broker.emit).not.toHaveBeenCalledWith('faktory.jobs.job.test.end', job)
      expect(broker.call).not.toHaveBeenCalledWith('faktory.hooks.test.end', { job })
    })

    it('should not call hooks (No args)', async () => {
      const next = jest.fn()
      const job = {
        jobtype: 'job.test'
      }
      broker.emit = jest.fn()
      broker.call = jest.fn(() => false)
      await service.$worker.middleware[1]({ job }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.start', job)
      expect(broker.call).not.toHaveBeenCalledWith('faktory.hooks.test.start', { job, test: true })
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.end', job)
      expect(broker.call).not.toHaveBeenCalledWith('faktory.hooks.test.end', { job })
    })
  })

})
