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
      actions: {
        'test.job': {
          queue: true,
          async handler() {}
        },
        'test.no.job'() {}
      }
    })
    expect(service).toBeDefined()
    expect(service.$worker).toBeDefined()
    expect(service.$worker.client.connectionFactory.host).toBe('server')
    expect(service.$worker.client.connectionFactory.port).toBe('7419')
    expect(service.$worker.client.password).toBe('password')
    expect(service.$worker.registry['faktory.test.job']).toBeDefined()
    expect(service.$worker.registry['faktory.test.no.job']).toBeUndefined()
    expect(service.$worker.queues).toEqual(['faktory.test.job'])
  })

  it('should init worker namespaced', async () => {
    const broker = new ServiceBroker({ namespace: 'namespace', logger: false })
    const service = broker.createService({
      mixins: [WorkerService],
      settings: {
        faktory: {
          url: 'tcp://:password@server:7419',
          namespaced: true
        }
      },
      actions: {
        'test.job': {
          queue: true,
          async handler() {}
        },
        'test.no.job'() {}
      }
    })
    expect(service).toBeDefined()
    expect(service.$worker).toBeDefined()
    expect(service.$worker.client.connectionFactory.host).toBe('server')
    expect(service.$worker.client.connectionFactory.port).toBe('7419')
    expect(service.$worker.client.password).toBe('password')
    expect(service.$worker.registry['faktory.test.job']).toBeDefined()
    expect(service.$worker.registry['faktory.test.no.job']).toBeUndefined()
    expect(service.$worker.queues).toEqual(['namespace.faktory.test.job'])
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


describe('Faktory worker lifecycle actions', () => {
  const broker = new ServiceBroker({ namespace: 'namespace', logger: false })
  const service = broker.createService({
    mixins: [WorkerService],
    actions: {
      'hooks.test.start'() {},
      'hooks.test.end'() {},
      'job.test': {
        queue: true,
        async handler() { }
      }
    }
  })
  service.$worker.work = jest.fn()
  service.$worker.stop = jest.fn()

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

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

  it('should run hook middleware', async () => {
    const next = jest.fn()
    const job = {
      jobtype: 'job.test',
      args: [{ actionParam: true }]
    }
    broker.emit = jest.fn()
    broker.call = jest.fn()
    await service.$worker.middleware[1]({ job }, next)
    expect(next).toHaveBeenCalled()
  })

  describe('Job handle', () => {
    it('should run job', async () => {
      const job = {
        jobtype: 'job.test',
        args: [{ actionParam: true }, { meta: { user: {} } }]
      }
      broker.call = jest.fn(() => 42)
      let thunk = service.$worker.registry['faktory.job.test'](...job.args)
      const ctx = { job }
      await thunk(ctx)
      expect(broker.call).toHaveBeenCalledWith('faktory.job.test', { actionParam: true }, { meta: { user: {} } })
      expect(ctx.result).toBe(42)
      broker.call = jest.fn()
      delete job.args[1]
      thunk = service.$worker.registry['faktory.job.test'](...job.args)
      await thunk({ job })
      expect(broker.call).toHaveBeenCalledWith('faktory.job.test', { actionParam: true }, { meta: {} })
      thunk = service.$worker.registry['faktory.job.test']()
      await thunk({ job })
      expect(broker.call).toHaveBeenCalledWith('faktory.job.test', { }, { meta: {} })
    })

    it('should call start hooks', async () => {
      const next = jest.fn()
      const job = {
        jid: 1,
        jobtype: 'job.test',
        args: [{
          actionParam: true
        }, {
          hooks: {
            start: { handler: 'faktory.hooks.test.start', params: { test: true } }
          }
        }]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn()
      await service.$worker.middleware[1]({ job }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.start', job)
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.start', { test: true }, { meta: { job: job.jid } })
    })

    it('should brodacast start hooks', async () => {
      const next = jest.fn()
      const job = {
        jid: 1,
        jobtype: 'job.test',
        args: [{
          actionParam: true
        }, {
          hooks: {
            start: { broadcast: 'faktory.hooks.test.start', params: { test: true } }
          }
        }]
      }
      broker.broadcast = jest.fn()
      await service.$worker.middleware[1]({ job }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.broadcast).toHaveBeenCalledWith('faktory.hooks.test.start', { params: { test: true }, meta: { job: job.jid } })
    })

    it('should call end hooks', async () => {
      const next = jest.fn()
      const job = {
        jobtype: 'job.test',
        args: [{
          actionParam: true
        }, {
          hooks: {
            end: { handler: 'faktory.hooks.test.end' }
          },
          meta: {
            user: {}
          }
        }]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn()
      await service.$worker.middleware[1]({ job, result: 42 }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.end', { ...job, result: 42 })
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.end', { }, { meta: { user: {}, job: job.jid, result: 42 } })
    })

    it('should call error hooks', async () => {
      const error = new Error('Error')
      const next = jest.fn(() => { throw error })
      const job = {
        jobtype: 'job.test',
        args: [{
          actionParam: true
        }, {
          hooks: {
            error: { handler: 'faktory.hooks.test.error' }
          },
          meta: {
            user: {}
          }
        }]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn()
      let excpection = null
      try {
        await service.$worker.middleware[1]({ job }, next)
      } catch (error) {
        excpection = error
      }
      expect(excpection).toEqual(error)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.error', { ...job, error })
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.error', { }, { meta: { user: {}, job: job.jid, error } })
    })

    it('should call start hooks and block job', async () => {
      const next = jest.fn()
      const job = {
        jid: 1,
        jobtype: 'job.test',
        args: [{
          actionParam: true
        }, {
          hooks: {
            start: { handler: 'faktory.hooks.test.start', params: { test: true } }
          },
          meta: { zero: 'two' }
        }]
      }
      broker.emit = jest.fn()
      broker.call = jest.fn(() => false)
      await service.$worker.middleware[1]({ job }, next)
      expect(next).not.toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.start', job)
      expect(broker.call).toHaveBeenCalledWith('faktory.hooks.test.start', { test: true }, { meta: { zero: 'two', job: job.jid } })
      expect(broker.emit).not.toHaveBeenCalledWith('faktory.jobs.job.test.end', job)
      expect(broker.call).not.toHaveBeenCalledWith('faktory.hooks.test.end', { job })
    })

    it('should not call hooks (No args)', async () => {
      const next = jest.fn()
      const job = {
        jid: 1,
        jobtype: 'job.test'
      }
      broker.emit = jest.fn()
      broker.call = jest.fn(() => false)
      await service.$worker.middleware[1]({ job }, next)
      expect(next).toHaveBeenCalled()
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.start', job)
      expect(broker.call).not.toHaveBeenCalledWith('faktory.hooks.test.start', { test: true })
      expect(broker.emit).toHaveBeenCalledWith('faktory.jobs.job.test.end', job)
      expect(broker.call).not.toHaveBeenCalledWith('faktory.hooks.test.end', { job })
    })
  })

  it('should queue job', async () => {
    service.$worker.client.push = jest.fn()
    await service.queue({ meta: { user: {} } }, 'test', { test: 42 }, { start: { handler: 'test' } })
    expect(service.$worker.client.push).toHaveBeenCalledWith({
      args: [{ test: 42 }, { hooks: { start: { handler: 'test' } }, meta: { user: {} } }],
      queue: 'test',
      jobtype: 'test'
    })
  })

  it('should queue namespaced', async () => {
    service.settings.faktory.namespaced = true
    service.$worker.client.push = jest.fn()
    await service.queue({ meta: { user: {} } }, 'job.test', { test: 42 }, { start: { handler: 'test' } })
    expect(service.$worker.client.push).toHaveBeenCalledWith({
      args: [{ test: 42 }, { hooks: { start: { handler: 'test' } }, meta: { user: {} } }],
      queue: 'namespace.job.test',
      jobtype: 'job.test'
    })
  })
})
