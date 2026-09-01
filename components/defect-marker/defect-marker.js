Component({
  properties: {
    defect: { type: Object, value: {} },
    compact: { type: Boolean, value: false }
  },
  methods: {
    onTap: function () {
      this.triggerEvent('markertap', { defect: this.data.defect });
    }
  }
});
