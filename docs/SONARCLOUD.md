# SonarQube Cloud

- Project: [`CrimsBerith_LociAR`](https://sonarcloud.io/project/overview?id=CrimsBerith_LociAR), organization `crimsberith`.
- Automatic analysis is enabled for `main` and pull requests. There is no separate Sonar GitHub Actions workflow or `SONAR_TOKEN` requirement for this mode.
- `SonarCloud Code Analysis` remains a required branch-protection check.
- Keep test harnesses and generated output excluded through `.sonarcloud.properties`; keep application and backend source in scope.

## Repeated cancelled analyses: private LOC quota

On 18 October 2026, PR #58's background task `AaFLeZRiDHT7I1azedg3` showed the actual failure: the organization's 50,000 private-line limit would be exceeded. The other private project, `seven-ios-apps`, used 28,849 lines; the incoming LociAR analysis contained 24,097 lines, totaling 52,946. The previous successful LociAR analysis contained 21,009 lines.

The failed task's scanner context already included the configured test/build exclusions. Adding more production exclusions or refactoring reported code smells would not address this quota failure. GitHub displayed the failed background task as `CANCELLED`, which was not a GitHub Actions concurrency cancellation.

With the owner's explicit approval, LociAR's Sonar visibility was changed to public, matching the existing public GitHub repository. Public lines do not consume the organization's private-line allowance. No subscription purchase, deletion of the other project, quality-gate relaxation, or production-source exclusion was needed.

## Diagnose before changing code

1. Open **Administration > Background tasks > Menu > Show Error Details**. A background task failure is separate from a completed analysis whose quality gate fails.
2. For a line-limit error, check organization **Billing and usage** and its per-project distribution. Private projects share the organization's allowance. Do not make a project public or delete another project without the owner's approval.
3. Check **Show SonarScanner Context** to confirm the exclusions actually used by that run.
4. Once the underlying failure is resolved, push a commit to trigger automatic analysis, then verify both the Sonar background-task result and the GitHub check on the new commit.

References: [subscription and LOC calculation](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans), [analysis troubleshooting](https://docs.sonarsource.com/sonarqube-cloud/appendices/troubleshooting), [project visibility](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/setting-permissions).
