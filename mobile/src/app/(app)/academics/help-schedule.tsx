import { HelpSteps } from '@/components/HelpSteps';

// To add screenshots: save them in mobile/assets/tutorials/ and add
// `image: require('../../../../assets/tutorials/schedule-1.png')` to a step.
export default function HelpSchedule() {
  return (
    <HelpSteps
      intro="Uni Promax needs a calendar file (.ics) with your weekly classes. If your classes are in Google Calendar, you can export them from there."
      steps={[
        { text: 'MyASU: open your class schedule and look for an option to add it to a calendar or download it as a calendar (.ics) file. If you see one, save the file and skip to the last step.' },
        { text: 'Google Calendar: on a computer, open calendar.google.com, click the gear icon, then "Settings".' },
        { text: 'Click "Import & export" on the left, then "Export". A .zip file downloads.' },
        { text: 'Open the .zip. Inside is one .ics file per calendar; use the one that has your classes.' },
        { text: 'Get the .ics file onto your phone (email it to yourself, or save it to Google Drive / iCloud Drive), then tap "Choose .ics file" in Uni Promax and pick it.' },
      ]}
      footer="You only need to do this once per semester."
    />
  );
}
