import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Steps24 = (props) => {
  return (
    <>
      <div className="steps24-container1 thq-section-padding">
        <div className="steps24-max-width thq-section-max-width">
          <div className="steps24-container2 thq-grid-2">
            <div className="steps24-section-header">
              <h2 className="thq-heading-2">
                Discover the Power of Our Products
              </h2>
              <p className="thq-body-large">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                Suspendisse varius enim in eros elementum tristique. Duis
                cursus, mi quis viverra ornare, eros dolor interdum nulla, ut
                commodo diam libero vitae erat.
              </p>
              <div className="steps24-actions">
                <button className="thq-button-filled thq-button-animated steps24-button">
                  <span className="thq-body-small">Main action</span>
                </button>
              </div>
            </div>
            <div className="steps24-container3">
              <div className="steps24-container4 thq-card">
                <h2 className="thq-heading-2">
                  {props.step1Title ?? (
                    <Fragment>
                      <span className="steps24-text28">Sign Up</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps24-text14 thq-body-small">
                  {props.step1Description ?? (
                    <Fragment>
                      <span className="steps24-text29">
                        Create an account to get started on our platform
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps24-text15 thq-heading-3">01</label>
              </div>
              <div className="steps24-container5 thq-card">
                <h2 className="thq-heading-2">
                  {props.step2Title ?? (
                    <Fragment>
                      <span className="steps24-text31">Explore</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps24-text17 thq-body-small">
                  {props.step2Description ?? (
                    <Fragment>
                      <span className="steps24-text32">
                        Discover a wide range of features and services available
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps24-text18 thq-heading-3">02</label>
              </div>
              <div className="steps24-container6 thq-card">
                <h2 className="thq-heading-2">
                  {props.step3Title ?? (
                    <Fragment>
                      <span className="steps24-text30">Engage</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps24-text20 thq-body-small">
                  {props.step3Description ?? (
                    <Fragment>
                      <span className="steps24-text26">
                        Interact with other users and participate in discussions
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps24-text21 thq-heading-3">03</label>
              </div>
              <div className="steps24-container7 thq-card">
                <h2 className="thq-heading-2">
                  {props.step4Title ?? (
                    <Fragment>
                      <span className="steps24-text27">Enjoy</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps24-text23 thq-body-small">
                  {props.step4Description ?? (
                    <Fragment>
                      <span className="steps24-text25">
                        Make the most out of your experience and enjoy all the
                        benefits
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps24-text24 thq-heading-3">04</label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .steps24-container1 {
            width: 100%;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
            justify-content: center;
          }
          .steps24-max-width {
            gap: var(--dl-layout-space-fourunits);
            width: 100%;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .steps24-container2 {
            align-items: start;
          }
          .steps24-section-header {
            gap: var(--dl-layout-space-oneandhalfunits);
            top: 10%;
            display: flex;
            position: sticky;
            align-items: flex-start;
            flex-direction: column;
          }
          .steps24-actions {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-items: flex-start;
          }
          .steps24-container3 {
            grid-area: span 1 / span 1 / span 1 / span 1;
          }
          .steps24-container4 {
            top: 10%;
            position: sticky;
            transform: rotate(-2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent1);
          }
          .steps24-text14 {
            text-align: center;
          }
          .steps24-text15 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps24-container5 {
            top: 10%;
            position: sticky;
            transform: rotate(2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent2);
          }
          .steps24-text17 {
            text-align: center;
          }
          .steps24-text18 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps24-container6 {
            top: 10%;
            position: sticky;
            transform: rotate(-2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent1);
          }
          .steps24-text20 {
            text-align: center;
          }
          .steps24-text21 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps24-container7 {
            top: 10%;
            position: sticky;
            transform: rotate(2deg);
            background-color: var(--dl-color-theme-accent2);
          }
          .steps24-text23 {
            text-align: center;
          }
          .steps24-text24 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps24-text25 {
            display: inline-block;
          }
          .steps24-text26 {
            display: inline-block;
          }
          .steps24-text27 {
            display: inline-block;
          }
          .steps24-text28 {
            display: inline-block;
          }
          .steps24-text29 {
            display: inline-block;
          }
          .steps24-text30 {
            display: inline-block;
          }
          .steps24-text31 {
            display: inline-block;
          }
          .steps24-text32 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .steps24-max-width {
              flex-direction: column;
            }
          }
          @media (max-width: 767px) {
            .steps24-section-header {
              position: static;
              margin-bottom: var(--dl-layout-space-twounits);
            }
            .steps24-actions {
              width: 100%;
              align-self: flex-start;
            }
            .steps24-container4 {
              width: 100%;
            }
            .steps24-container5 {
              width: 100%;
            }
            .steps24-container6 {
              width: 100%;
            }
            .steps24-container7 {
              width: 100%;
            }
          }
          @media (max-width: 479px) {
            .steps24-button {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Steps24.defaultProps = {
  step4Description: undefined,
  step3Description: undefined,
  step4Title: undefined,
  step1Title: undefined,
  step1Description: undefined,
  step3Title: undefined,
  step2Title: undefined,
  step2Description: undefined,
}

Steps24.propTypes = {
  step4Description: PropTypes.element,
  step3Description: PropTypes.element,
  step4Title: PropTypes.element,
  step1Title: PropTypes.element,
  step1Description: PropTypes.element,
  step3Title: PropTypes.element,
  step2Title: PropTypes.element,
  step2Description: PropTypes.element,
}

export default Steps24
