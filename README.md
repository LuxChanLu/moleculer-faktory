# moleculer-faktory

[![Build Status](https://travis-ci.org/LuxChanLu/moleculer-faktory.svg?branch=master)](https://travis-ci.org/LuxChanLu/moleculer-faktory)
[![Coverage Status](https://coveralls.io/repos/github/LuxChanLu/moleculer-faktory/badge.svg?branch=master)](https://coveralls.io/github/LuxChanLu/moleculer-faktory?branch=master)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/3c0014c55eaa4c1cbf995d7befeb8a14)](https://www.codacy.com/app/Hugome/moleculer-faktory?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=LuxChanLu/moleculer-faktory&amp;utm_campaign=Badge_Grade)
[![Maintainability](https://api.codeclimate.com/v1/badges/20b478c63bda641cca99/maintainability)](https://codeclimate.com/github/LuxChanLu/moleculer-faktory/maintainability)
[![David](https://img.shields.io/david/LuxChanLu/moleculer-faktory.svg)](https://david-dm.org/LuxChanLu/moleculer-faktory)
[![Known Vulnerabilities](https://snyk.io/test/github/LuxChanLu/moleculer-faktory/badge.svg)](https://snyk.io/test/github/LuxChanLu/moleculer-faktory)

[![Downloads](https://img.shields.io/npm/dm/moleculer-faktory.svg)](https://www.npmjs.com/package/moleculer-faktory)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FLuxChanLu%2Fmoleculer-faktory.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FLuxChanLu%2Fmoleculer-faktory?ref=badge_shield)

## How to use it
### Worker (Service with your jobes)
```js
const { WorkerMixin } = require('moleculer-faktory')

module.exports = {
  name: 'images',
  mixins: [WorkerMixin],
  settings: {
    faktory: {
      /** @type {String} Faktory url (tcp://:passqueue@localhost:7419/) also FAKTORY_URL can be use. */
      url: 'tcp://:passqueue@localhost:7419',
      /** @type {Object?} Additional options for `new Worker()` */
      options: {
        concurrency: 5,
        timeout: 25 * 1000
      },
      /** @type {Array?} Middlewares for faktory */
      middlewares: [],
      /** @type {Boolean?} Enable hooks middleware */
      hooks: true
    }
  },
  actions: {
    resize: {
      queue: true,
      async handler(ctx) {
        const { image, size } = ctx.params
        const { user } = ctx.meta
        // Do the magic here !
      }
    }
  }
}
```
### Client (Service launching jobs)
```js
const { ClientMixin } = require('moleculer-faktory')

module.exports = {
  name: 'web',
  mixins: [ClientMixin],
  settings: {
    faktory: {
      /** @type {String} Faktory url (tcp://:passqueue@localhost:7419/) also FAKTORY_URL can be use. */
      url: 'tcp://:passqueue@localhost:7419',
      /** @type {Object?} Additional options for `new Client()` */
      options: {
        labels: ['test'],
      }
    }
  },
  actions: {
    async 'image.upload'(ctx) {
      ctx.meta.user = {} // Meta will be passed to the job handler
      await this.queue(ctx, 'images.resize', { image: ctx.params.image, size: 'landscape.large' })
      return 'In progress...'
    }
  }
}
```
You can also use hooks (No native from faktory, middleware in this module : See src/worker.js#72)
```js
const { ClientMixin } = require('moleculer-faktory')

module.exports = {
  name: 'web',
  mixins: [ClientMixin],
  settings: {
    faktory: {
      /** @type {String} Faktory url (tcp://:passqueue@localhost:7419/) also FAKTORY_URL can be use. */
      url: 'tcp://:passqueue@localhost:7419',
      /** @type {Object?} Additional options for `new Client()` */
      options: {
        labels: ['test'],
      }
    }
  },
  actions: {
    async 'image.upload'(ctx) {
      const { image } = ctx.params
      ctx.meta.user = {} // Meta will be passed to the job handler and also the hooks
      await this.queue(ctx, 'images.resize', { image: ctx.params.image, size: 'landscape.large' }, {
        start: { handler: 'web.image.start' },
        end: { handler: 'web.image.end', params: { image } }
      })
      return 'In progress...'
    },
    'image.start'() {
      // Automagicaly send to the client notification ?
    },
    'image.end'(ctx) {
      const { image } = ctx.params
      const { user } = ctx.meta
      // Automagicaly send to the client notification ?
    }
  }
}
```
