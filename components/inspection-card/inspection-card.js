Component({
  properties: { inspection: { type: Object, value: {} } },
  methods: {
    onTap: function () { this.triggerEvent('cardtap', { inspection: this.data.inspection }); }
  }
});
